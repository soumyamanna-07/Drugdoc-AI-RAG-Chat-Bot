"""LanceDB vector store: embed chunks and store them with their metadata.
Ported from Soumya's Chroma version — same public functions (get_embedder,
embed, add_chunks) so nothing calling this module needs to change."""
import threading
import re
from functools import lru_cache

import lancedb
from sentence_transformers import SentenceTransformer

from backend.rag import config
from backend.rag.schemas import Chunk

# Guards the check-then-create-or-add sequence in add_chunks(). Two
# concurrent ingestions can both see "table doesn't exist yet" and both call
# create_table() -- the second call either errors or clobbers the first,
# depending on LanceDB version. One lock around the whole read-decide-write
# sequence removes the race entirely (bounded, low-contention: ingestion
# already runs on a small thread pool, not one thread per request).
_table_lock = threading.RLock()
_fts_ready = False
_RRF_K = 60
_STAT_QUERY = re.compile(
    r"(?:%|percent|percentage|common|frequency|frequenc(?:y|ies)|incidence|rate|"
    r"how often|how many|patients?)",
    re.IGNORECASE,
)


@lru_cache(maxsize=1)
def get_embedder() -> SentenceTransformer:
    """Load the embedding model once and reuse it."""
    return SentenceTransformer(config.EMBED_MODEL)


def embed(texts: list[str]) -> list[list[float]]:
    """Normalized embeddings, so cosine distance behaves as expected."""
    return get_embedder().encode(texts, normalize_embeddings=True).tolist()


@lru_cache(maxsize=1)
def get_db():
    return lancedb.connect(str(config.LANCEDB_DIR))


def get_table():
    """None if nothing's been ingested yet — callers should handle that."""
    db = get_db()
    if config.COLLECTION_NAME in db.list_tables().tables:
        return db.open_table(config.COLLECTION_NAME)
    return None


def distinct_values(column: str) -> list[str]:
    """Read one metadata column without materializing the embedding table."""
    table = get_table()
    if table is None or column not in table.schema.names:
        return []

    try:
        rows = table.to_arrow(columns=[column]).column(column).to_pylist()
    except TypeError:
        # Older LanceDB versions may not accept the columns keyword, but can
        # still project columns through the table's scanner.
        # For newer versions (e.g. 0.38+), use search().select().
        rows = table.search().select([column]).to_arrow().column(column).to_pylist()
    return sorted({str(value) for value in rows if value not in (None, "")})


def document_records() -> list[dict]:
    """Return one metadata record per source file, without loading vectors."""
    table = get_table()
    if table is None:
        return []
    columns = ["source_file", "original_filename", "drug_name", "source_type",
               "version", "effective_date", "ingestion_timestamp"]
    columns = [column for column in columns if column in table.schema.names]
    if "source_file" not in columns:
        return []
    try:
        rows = table.to_arrow(columns=columns).to_pylist()
    except TypeError:
        rows = table.search().select(columns).to_arrow().to_pylist()

    documents = {}
    for row in rows:
        source_file = row.get("source_file")
        if source_file and source_file not in documents:
            documents[source_file] = {
                "id": source_file,
                "filename": row.get("original_filename") or source_file,
                "drug_name": row.get("drug_name") or "unknown",
                "source_type": row.get("source_type") or "unknown",
                "version": row.get("version") or "unknown",
                "effective_date": row.get("effective_date") or "unknown",
                "ingestion_timestamp": row.get("ingestion_timestamp"),
            }
    return sorted(documents.values(), key=lambda item: item["filename"].lower())


def _row(chunk: Chunk, vector: list[float]) -> dict:
    row = chunk.model_dump(exclude_none=True)
    row["vector"] = vector
    return row


def _ensure_fts_index(table, force: bool = False) -> None:
    """Create the persistent Tantivy/BM25 index once for the text column."""
    global _fts_ready
    if _fts_ready and not force:
        return
    with _table_lock:
        if _fts_ready and not force:
            return
        try:
            table.create_fts_index("text", replace=True)
            _fts_ready = True
        except (AttributeError, RuntimeError, ValueError) as exc:
            # Vector retrieval remains available if a deployment lacks the
            # optional LanceDB FTS/Tantivy support.
            print(f"[vector_store] FTS index unavailable: {exc}")


def _where_drugs(search, drug_names: list[str] | None,
                 source: str | None = None, audience: str | None = None):
    if drug_names:
        names = ", ".join(f"'{name.lower().replace(chr(39), chr(39) * 2)}'" for name in drug_names)
        search = search.where(f"drug_name IN ({names})")
    if source:
        search = search.where(f"source = '{source.replace(chr(39), chr(39) * 2)}'")
    if audience:
        search = search.where(f"audience = '{audience.replace(chr(39), chr(39) * 2)}'")
    return search


def hybrid_search(query: str, drug_names: list[str] | None = None,
                  limit: int = config.TOP_K, source: str | None = None,
                  audience: str | None = None) -> list[dict]:
    """Run vector and BM25 searches, then fuse their ranks with RRF.

    The returned rows retain ``_distance`` for the existing cosine-based
    relevance gate and add only private ranking metadata for the retriever.
    """
    table = get_table()
    if table is None or table.count_rows() == 0:
        return []

    candidate_limit = min(max(limit * 3, 10), table.count_rows())
    vector_rows = _where_drugs(
        table.search(embed([query])[0]).metric("cosine"), drug_names, source, audience
    ).limit(candidate_limit).to_list()

    fts_rows = []
    _ensure_fts_index(table)
    try:
        fts_rows = _where_drugs(
            table.search(query, query_type="fts"), drug_names, source, audience
        ).limit(candidate_limit).to_list()
    except (AttributeError, RuntimeError, TypeError, ValueError) as exc:
        print(f"[vector_store] FTS search unavailable; using vector results: {exc}")

    fts_weight = 0.72 if _STAT_QUERY.search(query) else 0.5
    vector_weight = 1.0 - fts_weight
    merged: dict[str, dict] = {}
    scores: dict[str, float] = {}
    vector_scores: dict[str, float] = {}

    for rank, row in enumerate(vector_rows, start=1):
        chunk_id = row.get("chunk_id")
        if not chunk_id:
            continue
        merged[chunk_id] = dict(row)
        vector_scores[chunk_id] = max(0.0, min(1.0, 1 - row.get("_distance", 1)))
        scores[chunk_id] = scores.get(chunk_id, 0.0) + vector_weight / (_RRF_K + rank)

    for rank, row in enumerate(fts_rows, start=1):
        chunk_id = row.get("chunk_id")
        if not chunk_id:
            continue
        if chunk_id not in merged:
            merged[chunk_id] = dict(row)
        scores[chunk_id] = scores.get(chunk_id, 0.0) + fts_weight / (_RRF_K + rank)
        merged[chunk_id]["_fts_rank"] = rank

    ranked = []
    for chunk_id, row in merged.items():
        vector_score = vector_scores.get(chunk_id, 0.0)
        fts_rank = row.get("_fts_rank")
        # An exact BM25 hit is evidence even when it falls outside the
        # semantic candidate set; preserve a gate-compatible score for it.
        retrieval_score = vector_score if vector_score else (
            max(config.MIN_RELEVANCE, 1.0 - 0.05 * (fts_rank - 1))
            if fts_rank else 0.0
        )
        row["_retrieval_score"] = round(retrieval_score, 3)
        row["_hybrid_score"] = scores[chunk_id]
        ranked.append(row)
    ranked.sort(key=lambda row: row["_hybrid_score"], reverse=True)
    return ranked[:limit]


def add_chunks(chunks: list[Chunk]) -> None:
    """Insert or update chunks (safe to run more than once — re-adding a
    chunk_id that already exists replaces it rather than duplicating it)."""
    if not chunks:
        return
    vectors = embed([c.text for c in chunks])
    rows = [_row(c, v) for c, v in zip(chunks, vectors)]

    with _table_lock:
        db = get_db()
        if config.COLLECTION_NAME in db.list_tables().tables:
            table = db.open_table(config.COLLECTION_NAME)
            if "original_filename" not in table.schema.names:
                table.add_columns({"original_filename": "CAST(NULL AS string)"})
            if "source" not in table.schema.names:
                table.add_columns({"source": "CAST('label' AS string)"})
            if "audience" not in table.schema.names:
                table.add_columns({"audience": "CAST('clinician' AS string)"})
            if "source_url" not in table.schema.names:
                table.add_columns({"source_url": "CAST(NULL AS string)"})
            if hasattr(table, "merge_insert"):
                # True atomic upsert-by-key where the installed LanceDB
                # supports it -- no window where a chunk_id is briefly
                # missing between a delete and the following add (which is
                # what a concurrent /query's retrieve() could otherwise
                # observe).
                (table.merge_insert("chunk_id")
                      .when_matched_update_all()
                      .when_not_matched_insert_all()
                      .execute(rows))
            else:
                # Older LanceDB without merge_insert: same delete-then-add
                # as before. Still correct (still holds _table_lock so it
                # can't race with another ingestion), just not atomic
                # against a concurrent reader for the brief window between
                # the two calls -- disclosed limitation, not silently hidden.
                ids = ", ".join(f"'{c.chunk_id}'" for c in chunks)
                table.delete(f"chunk_id IN ({ids})")
                table.add(rows)
            _ensure_fts_index(table, force=True)
        else:
            table = db.create_table(config.COLLECTION_NAME, data=rows)
            _ensure_fts_index(table, force=True)


def delete_by_source_file(source_file: str) -> int:
    """Removes every chunk belonging to one uploaded document. Returns the
    row count before deletion (LanceDB's delete() doesn't report a count),
    so the caller can tell whether anything actually matched."""
    with _table_lock:
        table = get_table()
        if table is None:
            return 0
        escaped = source_file.replace("'", "''")
        before = table.count_rows(f"source_file = '{escaped}'")
        if before:
            table.delete(f"source_file = '{escaped}'")
        return before


if __name__ == "__main__":
    from backend.rag.sample_chunks import SAMPLE_CHUNKS

    add_chunks(SAMPLE_CHUNKS)
    table = get_table()
    print(f"Stored {table.count_rows()} chunks in table '{config.COLLECTION_NAME}'")
    print(f"Location: {config.LANCEDB_DIR}")
