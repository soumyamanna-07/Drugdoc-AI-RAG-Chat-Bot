from __future__ import annotations

import time
from collections import deque
from threading import Lock


class LatencyTracker:
    """Small in-process rolling latency tracker.

    This intentionally measures the API boundary rather than changing domain
    answer generation. It makes it possible to identify whether latency is
    coming from auth, retrieval, generation, or network/application overhead
    before changing RAG settings.
    """

    def __init__(self, max_samples: int = 500):
        self._samples = deque(maxlen=max_samples)
        self._lock = Lock()

    def observe(self, path: str, method: str, status: int, elapsed_ms: float) -> None:
        with self._lock:
            self._samples.append({
                "path": path,
                "method": method,
                "status": status,
                "elapsed_ms": round(elapsed_ms, 2),
                "ts": time.time(),
            })

    def snapshot(self) -> dict:
        with self._lock:
            samples = list(self._samples)

        if not samples:
            return {"count": 0, "avg_ms": 0, "p95_ms": 0, "slowest": []}

        values = sorted(x["elapsed_ms"] for x in samples)
        p95_index = min(len(values) - 1, max(0, int(len(values) * 0.95) - 1))
        slowest = sorted(samples, key=lambda x: x["elapsed_ms"], reverse=True)[:10]
        return {
            "count": len(values),
            "avg_ms": round(sum(values) / len(values), 2),
            "p95_ms": round(values[p95_index], 2),
            "slowest": slowest,
        }


latency_tracker = LatencyTracker()
