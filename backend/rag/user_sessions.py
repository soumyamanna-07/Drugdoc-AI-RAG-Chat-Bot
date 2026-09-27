"""
Authenticated user-owned chat-session helpers.

This module deliberately wraps the existing SQLite chat-session database
instead of replacing the existing history implementation.

Security rule:

    bearer token -> authenticated user_id -> owned session -> history

The frontend must never provide user_id.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from typing import Any

from backend.app.config import SESSION_DB_PATH


def _db_path() -> str:
    import os
    return os.getenv("SESSION_DB_PATH", str(SESSION_DB_PATH))


def connection() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path(), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")

    # Keep the session database schema compatible with the existing
    # query_understanding history implementation.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_sessions (
            session_id TEXT PRIMARY KEY,
            last_used REAL NOT NULL,
            summary TEXT,
            parent_session_id TEXT,
            summary_tokens INTEGER NOT NULL DEFAULT 0,
            rolled_over_at REAL,
            user_id TEXT,
            title TEXT,
            drug_name TEXT,
            created_at REAL,
            updated_at REAL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            additional_json TEXT NOT NULL DEFAULT '{}'
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS response_cache (
            session_id TEXT NOT NULL,
            normalized_query TEXT NOT NULL,
            response_json TEXT NOT NULL,
            created_at REAL NOT NULL,
            PRIMARY KEY(session_id, normalized_query)
        )
        """
    )

    # Existing databases may have been created before the user-owned
    # session fields existed.
    migrations = [
        ("user_id", "TEXT"),
        ("title", "TEXT"),
        ("drug_name", "TEXT"),
        ("created_at", "REAL"),
        ("updated_at", "REAL"),
    ]

    existing = {
        row["name"]
        for row in conn.execute(
            "PRAGMA table_info(chat_sessions)"
        ).fetchall()
    }

    for column, definition in migrations:
        if column not in existing:
            conn.execute(
                f"ALTER TABLE chat_sessions ADD COLUMN {column} {definition}"
            )

    # Backfill timestamps only.
    #
    # IMPORTANT:
    # Existing anonymous sessions are deliberately NOT assigned a user_id.
    # This prevents one authenticated user from inheriting another user's
    # historical/anonymous conversation.
    conn.execute(
        """
        UPDATE chat_sessions
        SET created_at = COALESCE(created_at, last_used),
            updated_at = COALESCE(updated_at, last_used)
        WHERE created_at IS NULL OR updated_at IS NULL
        """
    )

    conn.commit()
    return conn

def create_session(
    user_id: str,
    drug_name: str | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    session_id = str(uuid.uuid4())
    now = time.time()

    if title is None:
        title = drug_name or "New chat"

    conn = connection()
    conn.execute(
        """
        INSERT INTO chat_sessions
            (
                session_id,
                last_used,
                summary,
                parent_session_id,
                summary_tokens,
                rolled_over_at,
                user_id,
                title,
                drug_name,
                created_at,
                updated_at
            )
        VALUES (?, ?, NULL, NULL, 0, NULL, ?, ?, ?, ?, ?)
        """,
        (
            session_id,
            now,
            user_id,
            title,
            drug_name,
            now,
            now,
        ),
    )
    conn.commit()
    conn.close()

    return {
        "session_id": session_id,
        "title": title,
        "drug_name": drug_name,
        "created_at": now,
        "updated_at": now,
        "message_count": 0,
    }


def owns_session(user_id: str, session_id: str) -> bool:
    conn = connection()
    row = conn.execute(
        """
        SELECT 1
        FROM chat_sessions
        WHERE session_id = ?
          AND user_id = ?
        """,
        (session_id, user_id),
    ).fetchone()
    conn.close()
    return row is not None


def require_owned_session(user_id: str, session_id: str) -> None:
    if not owns_session(user_id, session_id):
        raise PermissionError("Session does not belong to the authenticated user.")


def get_session(user_id: str, session_id: str) -> dict[str, Any] | None:
    conn = connection()

    row = conn.execute(
        """
        SELECT
            s.session_id,
            s.title,
            s.drug_name,
            s.created_at,
            s.updated_at,
            s.last_used,
            COUNT(m.id) AS message_count
        FROM chat_sessions s
        LEFT JOIN chat_messages m
            ON m.session_id = s.session_id
        WHERE s.session_id = ?
          AND s.user_id = ?
        GROUP BY
            s.session_id,
            s.title,
            s.drug_name,
            s.created_at,
            s.updated_at,
            s.last_used
        """,
        (session_id, user_id),
    ).fetchone()

    if row is None:
        conn.close()
        return None

    messages = conn.execute(
        """
        SELECT id, role, content, additional_json
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY id
        """,
        (session_id,),
    ).fetchall()

    conn.close()

    return {
        "session_id": row["session_id"],
        "title": row["title"],
        "drug_name": row["drug_name"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "message_count": row["message_count"],
        "messages": [
            {
                "id": message["id"],
                "role": message["role"],
                "content": message["content"],
                "additional": json.loads(message["additional_json"] or "{}"),
            }
            for message in messages
        ],
    }


def list_sessions(user_id: str) -> list[dict[str, Any]]:
    conn = connection()

    rows = conn.execute(
        """
        SELECT
            s.session_id,
            s.title,
            s.drug_name,
            s.created_at,
            s.updated_at,
            COUNT(m.id) AS message_count
        FROM chat_sessions s
        LEFT JOIN chat_messages m
            ON m.session_id = s.session_id
        WHERE s.user_id = ?
        GROUP BY
            s.session_id,
            s.title,
            s.drug_name,
            s.created_at,
            s.updated_at
        ORDER BY COALESCE(s.updated_at, s.last_used) DESC
        """,
        (user_id,),
    ).fetchall()

    conn.close()

    return [
        {
            "session_id": row["session_id"],
            "title": row["title"],
            "drug_name": row["drug_name"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "message_count": row["message_count"],
        }
        for row in rows
    ]


def delete_session(user_id: str, session_id: str) -> bool:
    conn = connection()

    owned = conn.execute(
        """
        SELECT 1
        FROM chat_sessions
        WHERE session_id = ?
          AND user_id = ?
        """,
        (session_id, user_id),
    ).fetchone()

    if owned is None:
        conn.close()
        return False

    conn.execute(
        "DELETE FROM chat_messages WHERE session_id = ?",
        (session_id,),
    )
    conn.execute(
        "DELETE FROM response_cache WHERE session_id = ?",
        (session_id,),
    )
    conn.execute(
        "DELETE FROM chat_sessions WHERE session_id = ? AND user_id = ?",
        (session_id, user_id),
    )

    conn.commit()
    conn.close()
    return True


def get_selected_drug(session_id: str) -> str | None:
    """Return the medicine persisted on a session.

    API callers should perform ownership validation before exposing this value.
    The helper exists so the RAG/session layer uses one canonical persisted
    medicine identity instead of maintaining a process-global selected drug.
    """
    conn = connection()
    row = conn.execute(
        "SELECT drug_name FROM chat_sessions WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    conn.close()
    return row["drug_name"] if row and row["drug_name"] else None


def set_selected_drug(
    user_id: str,
    session_id: str,
    drug_name: str | None,
) -> None:
    require_owned_session(user_id, session_id)

    conn = connection()
    now = time.time()

    if drug_name:
        conn.execute(
            """
            UPDATE chat_sessions
            SET drug_name = ?,
                title = CASE
                    WHEN title IS NULL OR title = '' OR title = 'New chat'
                    THEN ?
                    ELSE title
                END,
                updated_at = ?,
                last_used = ?
            WHERE session_id = ?
              AND user_id = ?
            """,
            (drug_name, drug_name, now, now, session_id, user_id),
        )
    else:
        conn.execute(
            """
            UPDATE chat_sessions
            SET updated_at = ?,
                last_used = ?
            WHERE session_id = ?
              AND user_id = ?
            """,
            (now, now, session_id, user_id),
        )

    conn.commit()
    conn.close()


def touch(user_id: str, session_id: str) -> None:
    require_owned_session(user_id, session_id)

    conn = connection()
    now = time.time()
    conn.execute(
        """
        UPDATE chat_sessions
        SET last_used = ?,
            updated_at = ?
        WHERE session_id = ?
          AND user_id = ?
        """,
        (now, now, session_id, user_id),
    )
    conn.commit()
    conn.close()
