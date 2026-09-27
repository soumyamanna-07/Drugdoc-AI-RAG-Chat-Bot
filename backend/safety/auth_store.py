"""SQLite-backed users and short-lived signed bearer tokens."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path

from dotenv import load_dotenv

from backend.paths import DATA_DIR

load_dotenv()

DB_PATH = Path(os.getenv("AUTH_DB_PATH", str(DATA_DIR / "auth.sqlite3")))
TOKEN_TTL_SECONDS = int(os.getenv("AUTH_TOKEN_TTL_SECONDS", "3600"))


def _connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    return connection


def initialize() -> None:
    with _connection() as connection:
        connection.execute("""CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
            disabled INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL
        )""")
        for statement in (
            "ALTER TABLE users ADD COLUMN oauth_provider TEXT",
            "ALTER TABLE users ADD COLUMN oauth_subject TEXT",
        ):
            try:
                connection.execute(statement)
            except sqlite3.OperationalError:
                pass
        connection.execute("""CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_identity
            ON users(oauth_provider, oauth_subject)
            WHERE oauth_provider IS NOT NULL AND oauth_subject IS NOT NULL""")
        connection.execute("""CREATE TABLE IF NOT EXISTS oauth_states (
            state TEXT PRIMARY KEY,
            created_at REAL NOT NULL
        )""")
        admin_email = os.getenv("ADMIN_EMAIL")
        admin_password = os.getenv("ADMIN_PASSWORD")
        if admin_email and admin_password:
            existing = connection.execute(
                "SELECT id FROM users WHERE email = ?", (admin_email.strip(),)
            ).fetchone()
            if existing is None:
                connection.execute(
                    "INSERT INTO users(email, name, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)",
                    (admin_email.strip(), admin_email.split("@")[0], hash_password(admin_password), time.time()),
                )
            else:
                connection.execute(
                    "UPDATE users SET name = ?, password_hash = ?, role = 'admin', disabled = 0 WHERE email = ?",
                    (admin_email.split("@")[0], hash_password(admin_password), admin_email.strip()),
                )


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return base64.urlsafe_b64encode(salt + digest).decode()


def verify_password(password: str, encoded: str) -> bool:
    try:
        raw = base64.urlsafe_b64decode(encoded.encode())
        salt, expected = raw[:16], raw[16:]
        actual = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_user(email: str, name: str, password: str, role: str = "user") -> dict:
    if role not in {"user", "admin"}:
        raise ValueError("invalid role")
    initialize()
    with _connection() as connection:
        try:
            cursor = connection.execute(
                "INSERT INTO users(email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
                (email.strip(), name.strip(), hash_password(password), role, time.time()),
            )
        except sqlite3.IntegrityError as exc:
            raise ValueError("user already exists") from exc
        return {"id": str(cursor.lastrowid), "email": email.strip(), "name": name.strip(), "role": role}


def authenticate(email: str, password: str) -> dict | None:
    initialize()
    with _connection() as connection:
        row = connection.execute("SELECT * FROM users WHERE email = ?", (email.strip(),)).fetchone()
    if row is None or row["disabled"] or not verify_password(password, row["password_hash"]):
        return None
    return {"id": str(row["id"]), "email": row["email"], "name": row["name"], "role": row["role"]}


def delete_user(user_id: str) -> None:
    """Remove a user created by a registration that could not be completed."""
    initialize()
    with _connection() as connection:
        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))


def oauth_user(provider: str, subject: str, email: str, name: str) -> dict:
    initialize()
    with _connection() as connection:
        row = connection.execute(
            "SELECT * FROM users WHERE oauth_provider = ? AND oauth_subject = ?",
            (provider, subject),
        ).fetchone()
        if row is None:
            row = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            if row is not None:
                connection.execute(
                    "UPDATE users SET oauth_provider = ?, oauth_subject = ? WHERE id = ?",
                    (provider, subject, row["id"]),
                )
            else:
                cursor = connection.execute(
                    "INSERT INTO users(email, name, password_hash, role, created_at, oauth_provider, oauth_subject) VALUES (?, ?, '', 'user', ?, ?, ?)",
                    (email, name or email.split("@")[0], time.time(), provider, subject),
                )
                row = connection.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return {"id": str(row["id"]), "email": row["email"], "name": row["name"], "role": row["role"]}


def create_oauth_state(state: str) -> None:
    initialize()
    with _connection() as connection:
        connection.execute("DELETE FROM oauth_states WHERE created_at < ?", (time.time() - 600,))
        connection.execute("INSERT INTO oauth_states(state, created_at) VALUES (?, ?)", (state, time.time()))


def consume_oauth_state(state: str) -> bool:
    initialize()
    with _connection() as connection:
        row = connection.execute("SELECT 1 FROM oauth_states WHERE state = ? AND created_at >= ?", (state, time.time() - 600)).fetchone()
        connection.execute("DELETE FROM oauth_states WHERE state = ?", (state,))
        return row is not None


def _secret() -> bytes:
    secret = os.getenv("AUTH_SECRET")
    if not secret:
        raise RuntimeError("AUTH_SECRET is not configured")
    return secret.encode()


def _encode(value: dict) -> str:
    payload = base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=")
    signature = hmac.new(_secret(), payload, hashlib.sha256).digest()
    return payload.decode() + "." + base64.urlsafe_b64encode(signature).rstrip(b"=").decode()


def issue_token(user: dict) -> str:
    return _encode({**user, "exp": int(time.time()) + TOKEN_TTL_SECONDS})


def verify_token(token: str) -> dict | None:
    try:
        payload, encoded_signature = token.split(".", 1)
        signature = base64.urlsafe_b64decode(encoded_signature + "===")
        expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "===").decode())
        if int(data.get("exp", 0)) < int(time.time()):
            return None
        return data
    except (ValueError, TypeError, RuntimeError, json.JSONDecodeError):
        return None
