"""One place for where runtime state lives on disk, anchored to the repo
root rather than the process's current working directory. Previously
UPLOAD_DIR, the job checkpoint dir, the audit log, the review queue, and the
version registry each computed their own CWD-relative "data/..." path —
fine if you always launch uvicorn from the repo root, broken (or silently
writing to the wrong place) the moment you don't. backend/rag/config.py
already anchored its own paths off __file__; this does the same for
everything else."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent  # backend/ -> repo root
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
