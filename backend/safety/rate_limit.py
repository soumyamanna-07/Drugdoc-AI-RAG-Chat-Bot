"""Basic app-layer abuse protection: caps requests per IP per minute.

Honest scope note: this is not DDoS protection. A real volumetric attack
needs infrastructure-level mitigation (a WAF/CDN in front of the app —
Cloudflare, etc.), which is outside what an app process can defend against
by itself. What this actually does: stops one client from hammering the
LLM/embedding calls and running up cost or starving other users, which is
the realistic risk for a hackathon demo, not a botnet."""
import time
import os
import sqlite3
from pathlib import Path

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from backend.paths import DATA_DIR

WINDOW_SECONDS = 60
MAX_REQUESTS_PER_WINDOW = 120

# Status polling is a cheap dict lookup, not an LLM/embedding call — the
# thing the limit exists to protect against. At 1.2s poll interval a single
# upload over ~36s already blows the shared 30/min budget and starts 429ing
# a user watching their own upload progress.
_EXEMPT_PREFIXES = ("/ingest/", )
_EXEMPT_SUFFIXES = ("/status",)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._db_path = Path(os.getenv("RATE_LIMIT_DB_PATH", str(DATA_DIR / "rate_limit.sqlite3")))
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS rate_limit_hits (
                client_key TEXT NOT NULL,
                hit_at REAL NOT NULL
            )""")
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_rate_limit_hits ON rate_limit_hits(client_key, hit_at)"
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._db_path, timeout=10, isolation_level=None)
        connection.execute("PRAGMA journal_mode=WAL")
        return connection

    def _allow(self, client_key: str, now: float) -> bool:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            cutoff = now - WINDOW_SECONDS
            connection.execute("DELETE FROM rate_limit_hits WHERE hit_at <= ?", (cutoff,))
            count = connection.execute(
                "SELECT COUNT(*) FROM rate_limit_hits WHERE client_key = ? AND hit_at > ?",
                (client_key, cutoff),
            ).fetchone()[0]
            if count >= MAX_REQUESTS_PER_WINDOW:
                connection.execute("COMMIT")
                return False
            connection.execute(
                "INSERT INTO rate_limit_hits(client_key, hit_at) VALUES (?, ?)",
                (client_key, now),
            )
            connection.execute("COMMIT")
            return True

    async def dispatch(self, request: Request, call_next):
        # OPTIONS preflights are browser-generated; they carry no payload and
        # should not consume the rate-limit budget.
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if path.startswith(_EXEMPT_PREFIXES) and path.endswith(_EXEMPT_SUFFIXES):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        if not self._allow(client_ip, now):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
            )
        return await call_next(request)
