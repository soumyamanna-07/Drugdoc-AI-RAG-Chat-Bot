from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

from backend.paths import DATA_DIR

DB_PATH = Path(os.getenv("CHAT_DB_PATH", str(DATA_DIR / "chat_history.sqlite3")))


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA synchronous=NORMAL")
    return c


def initialize() -> None:
    with _conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT 'New chat',
                topic TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
                ON conversations(user_id, updated_at DESC);

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
                content TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at REAL NOT NULL,
                FOREIGN KEY(session_id) REFERENCES conversations(session_id)
            );

            CREATE INDEX IF NOT EXISTS idx_messages_session_id
                ON messages(session_id, id);
            """
        )


def create_conversation(user_id: str, title: str = "New chat",
                        topic: str | None = None,
                        session_id: str | None = None) -> dict[str, Any]:
    initialize()
    sid = session_id or uuid.uuid4().hex
    now = time.time()
    with _conn() as c:
        c.execute(
            """INSERT INTO conversations
               (session_id, user_id, title, topic, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (sid, str(user_id), title[:160] or "New chat", topic, now, now),
        )
    return get_conversation(str(user_id), sid)  # type: ignore[return-value]


def get_conversation(user_id: str, session_id: str) -> dict[str, Any] | None:
    initialize()
    with _conn() as c:
        row = c.execute(
            """SELECT session_id, user_id, title, topic, created_at, updated_at
               FROM conversations
               WHERE session_id = ? AND user_id = ?""",
            (session_id, str(user_id)),
        ).fetchone()
    return dict(row) if row else None


def list_conversations(user_id: str, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    initialize()
    limit = max(1, min(int(limit), 100))
    offset = max(0, int(offset))
    with _conn() as c:
        rows = c.execute(
            """SELECT session_id, user_id, title, topic, created_at, updated_at
               FROM conversations
               WHERE user_id = ?
               ORDER BY updated_at DESC
               LIMIT ? OFFSET ?""",
            (str(user_id), limit, offset),
        ).fetchall()
    return [dict(r) for r in rows]


def rename_conversation(user_id: str, session_id: str, title: str) -> bool:
    initialize()
    with _conn() as c:
        cur = c.execute(
            """UPDATE conversations SET title = ?, updated_at = ?
               WHERE session_id = ? AND user_id = ?""",
            (title.strip()[:160] or "New chat", time.time(), session_id, str(user_id)),
        )
    return cur.rowcount == 1


def append_message(user_id: str, session_id: str, role: str,
                   content: str, metadata: dict[str, Any] | None = None) -> bool:
    if role not in {"user", "assistant", "system"}:
        raise ValueError("invalid message role")
    initialize()
    now = time.time()
    with _conn() as c:
        exists = c.execute(
            "SELECT 1 FROM conversations WHERE session_id = ? AND user_id = ?",
            (session_id, str(user_id)),
        ).fetchone()
        if exists is None:
            return False
        c.execute(
            """INSERT INTO messages
               (session_id, user_id, role, content, metadata_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                session_id, str(user_id), role, content,
                json.dumps(metadata or {}, ensure_ascii=False),
                now,
            ),
        )
        c.execute(
            "UPDATE conversations SET updated_at = ? WHERE session_id = ? AND user_id = ?",
            (now, session_id, str(user_id)),
        )
    return True


def get_messages(user_id: str, session_id: str, limit: int = 200) -> list[dict[str, Any]]:
    initialize()
    limit = max(1, min(int(limit), 500))
    with _conn() as c:
        rows = c.execute(
            """SELECT id, role, content, metadata_json, created_at
               FROM messages
               WHERE session_id = ? AND user_id = ?
               ORDER BY id ASC
               LIMIT ?""",
            (session_id, str(user_id), limit),
        ).fetchall()
    result = []
    for r in rows:
        item = dict(r)
        try:
            item["metadata"] = json.loads(item.pop("metadata_json"))
        except (TypeError, json.JSONDecodeError):
            item["metadata"] = {}
            item.pop("metadata_json", None)
        result.append(item)
    return result


def delete_conversation(user_id: str, session_id: str) -> bool:
    initialize()
    with _conn() as c:
        exists = c.execute(
            "SELECT 1 FROM conversations WHERE session_id = ? AND user_id = ?",
            (session_id, str(user_id)),
        ).fetchone()
        if exists is None:
            return False
        c.execute(
            "DELETE FROM messages WHERE session_id = ? AND user_id = ?",
            (session_id, str(user_id)),
        )
        c.execute(
            "DELETE FROM conversations WHERE session_id = ? AND user_id = ?",
            (session_id, str(user_id)),
        )
    return True
