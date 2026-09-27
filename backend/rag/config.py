"""Settings for the RAG part. Change values here, not inside the code."""
import os
from pathlib import Path

RAG_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = RAG_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "data"

# Vector store (LanceDB, embedded, stored on disk — switched from Chroma per
# the mentor's suggestion: zero-ops, no external hosting, natively multimodal)
LANCEDB_DIR = Path(os.getenv("LANCEDB_DIR", str(DATA_DIR / "lancedb_data")))
LANCEDB_DIR.mkdir(parents=True, exist_ok=True)
COLLECTION_NAME = "drug_labels"

# Embedding model: must be the SAME model the ingestion teammate uses
EMBED_MODEL = os.getenv("EMBED_MODEL", os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"))

# Retrieval
TOP_K = 4

# Relevance gate (cosine similarity, 0 to 1; tune on real data)
MIN_RELEVANCE = 0.45          # best chunk must reach this when a drug is identified
MIN_RELEVANCE_NO_DRUG = 0.60  # stricter when no drug could be identified
MIN_SUPPORT = 0.30            # chunks below this are not sent to the LLM as evidence

# Generation
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")   # local Llama 3 (no key needed)
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")  # used only if GROQ_API_KEY is set
TEMPERATURE = 0.1             # low = factual, consistent answers

# Conversation memory rollover. Token estimation is intentionally conservative
# and dependency-free; exact provider token counts are not available locally.
CONTEXT_WINDOW_TOKENS = int(os.getenv("CONTEXT_WINDOW_TOKENS", "8192"))
CONTEXT_WARNING_RATIO = float(os.getenv("CONTEXT_WARNING_RATIO", "0.8"))
CONTEXT_RESPONSE_RESERVE = int(os.getenv("CONTEXT_RESPONSE_RESERVE", "1024"))
SUMMARY_MAX_TOKENS = int(os.getenv("SUMMARY_MAX_TOKENS", "800"))

# Citation check
MIN_CITATION_COVERAGE = 0.8   # at least 80% of factual sentences must be cited


