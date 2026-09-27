"""Bridges the ingestion pipeline (parsing, OCR, chunking, embedding — all
Suman's tested modules, untouched) to the single shared LanceDB store that
retriever.py actually searches. Split into parse/scan/store so the API layer
can reject a document before anything from it is written anywhere.
"""
from backend.app.embeddings.embedder import Embedder
from backend.app.ingestion.chunker import Chunker
from backend.app.ingestion.parser import ParserFactory
from backend.app.metadata.versioning import VersionManager
from backend.rag.schemas import Chunk as RagChunk
from backend.rag.vector_store import add_chunks


def _to_rag_chunk(chunk) -> RagChunk:
    """Suman's Chunk -> the canonical Chunk the retriever/gates/citations use.
    Field names differ in a couple of places (page_number -> page,
    label_version -> version); everything else carries straight through."""
    return RagChunk(
        chunk_id=chunk.chunk_id,
        text=chunk.text,
        drug_name=chunk.drug_name,
        section=chunk.section,
        source_file=chunk.source_file,
        page=chunk.page_number,
        version=chunk.label_version,
        document_id=chunk.document_id,
        set_id=chunk.set_id,
        active_ingredient=chunk.active_ingredient,
        subsection=chunk.subsection,
        source_type=chunk.source_type,
        source_identifier=chunk.source_identifier,
        effective_date=chunk.effective_date,
        ingestion_timestamp=chunk.ingestion_timestamp,
        extraction_method=chunk.extraction_method,
        original_filename=chunk.original_filename,
        source=chunk.source,
        audience=chunk.audience,
        source_url=chunk.source_url,
    )


def parse_and_chunk(path: str, doc_id: str = None, drug_name: str = None,
                    original_filename: str = None) -> list[RagChunk]:
    """Parse + chunk only — nothing is written to the store OR the version
    registry yet, so a caller can run a safety check (injection scan, size
    limit, etc.) on the result before deciding whether to keep any record of
    it at all. (Version tagging used to happen here, before the injection
    scan ever ran — meaning a rejected document, including plainly-wrong
    test uploads, still got permanently registered. Moved to store_chunks,
    below, which only runs once a document is actually being kept.)"""
    doc = ParserFactory.parse_document(file_path=path, doc_id=doc_id, drug_name=drug_name,
                                       original_filename=original_filename)
    chunks = Chunker().chunk_document(doc)
    return [_to_rag_chunk(c) for c in chunks]


def parse_url_and_chunk(url: str, doc_id: str = None, drug_name: str = None) -> list[RagChunk]:
    """Fetch a patient-facing brand source and convert it to RAG chunks."""
    doc = ParserFactory.parse_url(url, doc_id=doc_id, drug_name=drug_name)
    return [_to_rag_chunk(c) for c in Chunker().chunk_document(doc)]


def _register_version(chunk: RagChunk) -> None:
    """Registers this document in the version registry. Reads fields straight
    off an already-built chunk instead of needing the original ParsedDocument
    object, since every chunk from one document carries the same
    document-level metadata. Same registry shape VersionManager.tag_document
    used to write, just called at the right time now."""
    vm = VersionManager()
    registry = vm.load_registry()
    registry.setdefault(chunk.drug_name, {})[chunk.version or "unknown"] = {
        "document_id": chunk.document_id,
        "set_id": chunk.set_id,
        "drug_name": chunk.drug_name,
        "active_ingredient": chunk.active_ingredient,
        "label_version": chunk.version,
        "effective_date": chunk.effective_date,
        "ingestion_timestamp": chunk.ingestion_timestamp,
        "source_file": chunk.source_file,
        "source_type": chunk.source_type,
        "source_identifier": chunk.source_identifier,
    }
    vm.save_registry(registry)


def store_chunks(chunks: list[RagChunk]) -> int:
    """Embed and write chunks, and only THEN register the document's version
    metadata -- reordered from "register, then embed+store" so a failure
    partway through embedding/storage (network error calling the embedding
    model, a LanceDB write error) can never leave a phantom registry entry
    for a document that was never actually stored. Returns the count written."""
    if not chunks:
        return 0
    add_chunks(chunks)
    _register_version(chunks[0])
    return len(chunks)


def ingest_and_export(path: str, doc_id: str = None, drug_name: str = None) -> int:
    """Convenience wrapper for scripts/manual runs — no safety check in
    between. The API endpoint uses parse_and_chunk() + store_chunks()
    separately instead, so it can scan before storing."""
    return store_chunks(parse_and_chunk(path, doc_id, drug_name))


if __name__ == "__main__":
    import sys
    n = ingest_and_export(sys.argv[1])
    print(f"Wrote {n} chunks to the shared LanceDB store.")
