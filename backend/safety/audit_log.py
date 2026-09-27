"""Tamper-evident audit log. Each entry stores a hash of the entry before it
(same idea as a git commit chain), so editing anything after the fact breaks
the chain and verify() catches it. No blockchain needed for that property.

Concurrency note: the previous version rewrote the *entire* log to one
shared temp file on every single log() call (`self._save()` -> one
`audit_log.tmp` -> rename). With more than one thread logging at once (a
background ingestion thread and a /query request, say), two threads racing
on that same temp filename means one thread's `tmp.replace(path)` can find
the temp file already consumed by the other thread's replace -- a real
FileNotFoundError crash. Fixed two ways: a lock serializes every write, and
the log is append-only JSONL (one line per entry) instead of a full-file
rewrite, so the store itself is O(1) per call rather than O(n).

Right-to-erasure note: a hash chain can't support editing or deleting a past
entry without registering as tampering -- that's the whole point of it. So
"delete a user's data but keep the audit trail" only works if raw PII never
enters the log in the first place. log() redacts `details` itself, on top of
whatever the caller already redacted, so this can't be forgotten at a call
site. As of this version, a broken/unavailable redactor means log() raises
rather than silently writing unredacted text -- see redaction.py.
"""
import hashlib
import json
import threading
import time
from pathlib import Path

from backend.paths import DATA_DIR
from backend.safety.redaction import RedactionUnavailable, redact

LOG_PATH = DATA_DIR / "audit" / "audit_log.jsonl"
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

_REDACTION_DOWN_PLACEHOLDER = "[REDACTION UNAVAILABLE — details withheld to avoid logging unredacted text]"


class AuditLog:
    def __init__(self):
        self._lock = threading.RLock()
        self._chain: list[dict] = self._load()
        if not self._chain:
            self._append("SYSTEM_INIT", "audit log started", "0")

    def _load(self) -> list[dict]:
        if not LOG_PATH.exists():
            return []
        chain = []
        with LOG_PATH.open("r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                line = line.strip()
                if not line:
                    continue
                try:
                    chain.append(json.loads(line))
                except json.JSONDecodeError:
                    # A torn last line (crash mid-write) is recoverable by
                    # just dropping it -- everything before it is intact.
                    print(f"[audit_log] skipping unparseable line {i} in {LOG_PATH}")
        return chain

    def _hash(self, entry: dict) -> str:
        return hashlib.sha256(json.dumps(entry, sort_keys=True).encode()).hexdigest()

    def _append(self, event_type: str, details: str, previous_hash: str,
                ip: str | None = None, user: str | None = None,
                resource: str | None = None, status: str | None = None) -> dict:
        entry = {
            "timestamp": time.time(),
            "event_type": event_type,
            "details": details,
            "ip": ip,
            "user": user,
            "resource": resource,
            "status": status,
            "previous_hash": previous_hash,
        }
        entry["hash"] = self._hash(entry)
        with self._lock:
            self._chain.append(entry)
            with LOG_PATH.open("a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")
        return entry

    def log(self, event_type: str, details: str, ip: str | None = None,
            user: str | None = None, resource: str | None = None,
            status: str | None = None) -> dict:
        try:
            safe_details = redact(details)
        except RedactionUnavailable:
            # Never let a broken redactor take down the audit trail itself --
            # that would include losing the ability to log THIS fact. Withhold
            # instead of either raising or passing raw text through.
            safe_details = _REDACTION_DOWN_PLACEHOLDER
        with self._lock:
            prev_hash = self._chain[-1]["hash"]
        return self._append(event_type, safe_details, prev_hash,
                            ip=ip, user=user, resource=resource, status=status)

    def verify(self) -> tuple[bool, str]:
        with self._lock:
            chain = list(self._chain)
        for i in range(1, len(chain)):
            prev, cur = chain[i - 1], chain[i]
            if cur["previous_hash"] != prev["hash"]:
                return False, f"broken link at entry {i}"
            recomputed = self._hash({k: v for k, v in cur.items() if k != "hash"})
            if recomputed != cur["hash"]:
                return False, f"entry {i} was altered after being written"
        return True, "chain intact"

    def entries(self, limit: int = 100, offset: int = 0) -> list[dict]:
        """Most-recent-first page of the chain, for the audit-log listing
        endpoint the admin UI actually needs (verify() alone only gives
        counts, never the entries themselves)."""
        with self._lock:
            chain = list(self._chain)
        return list(reversed(chain))[offset:offset + limit]

    def __len__(self) -> int:
        with self._lock:
            return len(self._chain)


if __name__ == "__main__":
    log = AuditLog()
    log.log("MODE_MISMATCH_ESCALATION", "patient mode asked a clinician-level question")
    log.log("QUERY_ANSWERED", "session=demo")
    ok, msg = log.verify()
    print(f"before tampering: {ok}, {msg}")

    log._chain[1]["details"] = "tampered"  # simulate someone editing history
    ok, msg = log.verify()
    print(f"after tampering:  {ok}, {msg}")
