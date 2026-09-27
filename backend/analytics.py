"""Durable daily dashboard aggregates."""
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from backend.paths import DATA_DIR

DB_PATH = Path(os.getenv("ANALYTICS_DB_PATH", str(DATA_DIR / "analytics.sqlite3")))


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("""CREATE TABLE IF NOT EXISTS daily_document_stats (
        day TEXT PRIMARY KEY,
        uploaded INTEGER NOT NULL DEFAULT 0,
        processed INTEGER NOT NULL DEFAULT 0
    )""")
    connection.execute("""CREATE TABLE IF NOT EXISTS daily_query_stats (
        day TEXT PRIMARY KEY,
        queries INTEGER NOT NULL DEFAULT 0,
        approved INTEGER NOT NULL DEFAULT 0,
        escalated INTEGER NOT NULL DEFAULT 0
    )""")
    connection.execute("""CREATE TABLE IF NOT EXISTS daily_source_stats (
        day TEXT NOT NULL,
        source_type TEXT NOT NULL,
        documents INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(day, source_type)
    )""")
    connection.execute("""CREATE TABLE IF NOT EXISTS query_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at TEXT NOT NULL,
        status TEXT NOT NULL
    )""")
    return connection


def _increment(column: str) -> None:
    if column not in {"uploaded", "processed"}:
        raise ValueError("unsupported analytics counter")
    day = datetime.now(timezone.utc).date().isoformat()
    with _connect() as connection:
        connection.execute(
            f"INSERT INTO daily_document_stats(day, {column}) VALUES (?, 1) "
            f"ON CONFLICT(day) DO UPDATE SET {column} = {column} + 1",
            (day,),
        )


def record_upload() -> None:
    _increment("uploaded")


def record_processed() -> None:
    _increment("processed")


def record_query(status: str) -> None:
    day = datetime.now(timezone.utc).date().isoformat()
    column = "approved" if status == "APPROVED" else "escalated"
    with _connect() as connection:
        connection.execute(
            "INSERT INTO query_events(occurred_at, status) VALUES (?, ?)",
            (datetime.now(timezone.utc).isoformat(), status),
        )
        connection.execute(
            f"INSERT INTO daily_query_stats(day, queries, {column}) VALUES (?, 1, 1) "
            f"ON CONFLICT(day) DO UPDATE SET queries = queries + 1, {column} = {column} + 1",
            (day,),
        )


def record_source_usage(source_type: str) -> None:
    day = datetime.now(timezone.utc).date().isoformat()
    with _connect() as connection:
        connection.execute(
            "INSERT INTO daily_source_stats(day, source_type, documents) VALUES (?, ?, 1) "
            "ON CONFLICT(day, source_type) DO UPDATE SET documents = documents + 1",
            (day, source_type or "unknown"),
        )


def recent_activity(days: int = 30) -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT day, uploaded, processed FROM daily_document_stats ORDER BY day DESC LIMIT ?",
            (days,),
        ).fetchall()
    return [{"label": day, "uploaded": uploaded, "processed": processed}
            for day, uploaded, processed in reversed(rows)]


def history(days: int = 30) -> dict:
    days = max(1, min(days, 365))
    with _connect() as connection:
        document_rows = connection.execute(
            "SELECT day, uploaded, processed FROM daily_document_stats ORDER BY day DESC LIMIT ?",
            (days,),
        ).fetchall()
        query_rows = connection.execute(
            "SELECT day, queries, approved, escalated FROM daily_query_stats ORDER BY day DESC LIMIT ?",
            (days,),
        ).fetchall()
        source_rows = connection.execute(
            "SELECT day, source_type, documents FROM daily_source_stats ORDER BY day DESC LIMIT ?",
            (days * 20,),
        ).fetchall()
        query_timestamps = connection.execute(
            "SELECT occurred_at, status FROM query_events ORDER BY id DESC LIMIT ?",
            (days * 100,),
        ).fetchall()
    return {
        "processing": [{"day": day, "uploaded": uploaded, "processed": processed}
                       for day, uploaded, processed in reversed(document_rows)],
        "queries": [{"day": day, "queries": queries, "approved": approved,
                     "escalated": escalated}
                    for day, queries, approved, escalated in reversed(query_rows)],
        "source_usage": [{"day": day, "source_type": source_type,
                          "documents": documents}
                         for day, source_type, documents in reversed(source_rows)],
        "query_timestamps": [{"timestamp": timestamp, "status": status}
                      for timestamp, status in reversed(query_timestamps)],
    }
