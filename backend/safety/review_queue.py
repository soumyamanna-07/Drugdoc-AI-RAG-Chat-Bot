"""Holds anything the gates flagged until a reviewer approves, edits, or
rejects it. Persisted to data/audit/review_queue.json.

Concurrency note: same bug class as audit_log.py had -- a single shared
temp file, written on every flag()/resolve() call with no lock, races
under concurrent requests. Fixed with a lock around every read-modify-write.
"""
import json
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from backend.paths import DATA_DIR
from backend.safety.audit_log import AuditLog
from backend.safety.redaction import RedactionUnavailable, redact

QUEUE_PATH = DATA_DIR / "audit" / "review_queue.json"
QUEUE_PATH.parent.mkdir(parents=True, exist_ok=True)

_REDACTION_DOWN_PLACEHOLDER = "[REDACTION UNAVAILABLE — original query withheld]"


class HumanReviewQueue:
    def __init__(self, audit_log: AuditLog):
        self._lock = threading.RLock()
        self._pending: dict[str, dict] = self._load()
        self._audit_log = audit_log

    def _load(self) -> dict[str, dict]:
        if QUEUE_PATH.exists():
            try:
                return json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
            except Exception as e:
                print(f"[review_queue] couldn't read existing queue ({type(e).__name__}: {e}); starting empty")
        return {}

    def _save_locked(self) -> None:
        """Caller must already hold self._lock."""
        tmp = QUEUE_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._pending), encoding="utf-8")
        tmp.replace(QUEUE_PATH)

    def flag(self, query: str, mode: str, reason: str,
             user_id: str | None = None, session_id: str | None = None) -> dict:
        try:
            safe_query = redact(query)
        except RedactionUnavailable:
            # Escalating to a human reviewer is itself a safety action -- it
            # must still succeed even if redaction is down. Withhold the raw
            # query rather than either blocking the escalation or storing PII.
            safe_query = _REDACTION_DOWN_PLACEHOLDER

        request_id = str(uuid.uuid4())
        with self._lock:
            self._pending[request_id] = {
                "id": request_id,
                "timestamp": time.time(),
                "query": safe_query,
                "mode": mode,
                "reason": reason,
                "user_id": user_id,
                "session_id": session_id,
                "status": "PENDING",
                "reviewer_notes": None,
                "final_answer": None,
            }
            self._save_locked()
        self._audit_log.log("ESCALATED_TO_HUMAN", f"{request_id}: {reason}", resource=f"review:{request_id}")
        return {
            "status": "ESCALATED",
            "message": "This needs clinical verification before we can answer it. A reviewer has been notified.",
            "request_id": request_id,
        }

    def pending(self) -> list[dict]:
        with self._lock:
            return [r for r in self._pending.values() if r["status"] == "PENDING"]

    def get(self, request_id: str) -> dict:
        with self._lock:
            if request_id not in self._pending:
                raise KeyError(f"no such request: {request_id}")
            return dict(self._pending[request_id])

    def resolve(self, request_id: str, action: str, notes: str = "",
                answer: Optional[str] = None) -> dict:
        with self._lock:
            if request_id not in self._pending:
                raise KeyError(f"no such request: {request_id}")
            entry = self._pending[request_id]
            entry["status"] = action.upper()
            entry["reviewer_notes"] = notes
            if action.upper() == "EDITED" and answer:
                entry["final_answer"] = answer
            self._save_locked()
            result = dict(entry)
        self._audit_log.log(f"HUMAN_REVIEW_{action.upper()}", f"{request_id}: {notes}",
                            resource=f"review:{request_id}", status=action.upper())
        return result


if __name__ == "__main__":
    log = AuditLog()
    q = HumanReviewQueue(log)
    result = q.flag("Infant dosage for 6kg?", "patient", "mode mismatch")
    print(result["message"])
    pending = q.pending()
    q.resolve(pending[0]["id"], "reject", "cannot give pediatric dosing to patients directly")
    print(f"pending after resolve: {len(q.pending())}")
