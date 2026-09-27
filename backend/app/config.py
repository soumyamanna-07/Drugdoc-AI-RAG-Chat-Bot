import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("DATA_DIR", str(PROJECT_ROOT / "data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)
SESSION_DB_PATH = Path(os.getenv("SESSION_DB_PATH", str(DATA_DIR / "sessions.sqlite3")))
AUTH_DB_PATH = Path(os.getenv("AUTH_DB_PATH", str(DATA_DIR / "auth.sqlite3")))
RATE_LIMIT_DB_PATH = Path(os.getenv("RATE_LIMIT_DB_PATH", str(DATA_DIR / "rate_limit.sqlite3")))

class Config:
    CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 500))
    CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", 100))
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    # Bare "tesseract" resolves via PATH on Linux/Colab (after `apt-get install
    # tesseract-ocr`). The old hardcoded Windows path silently broke OCR on
    # every non-Windows host — run_ocr() swallows the resulting error and
    # returns empty text, which then reports as a normal empty page rather
    # than a failure. Set TESSERACT_CMD explicitly if your binary isn't on PATH.
    TESSERACT_CMD = os.getenv("TESSERACT_CMD", "tesseract")
    POOR_EXTRACTION_THRESHOLD = int(os.getenv("POOR_EXTRACTION_THRESHOLD", 50)) # min meaningful chars
    PRINTABLE_RATIO_THRESHOLD = float(os.getenv("PRINTABLE_RATIO_THRESHOLD", 0.7))
