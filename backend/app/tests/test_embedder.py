import pytest
from backend.app.embeddings.embedder import Embedder
from backend.app.models import Chunk

def test_embedder_basic():
    # sentence-transformers can take a little time to load, so we only embed a simple string
    embedder = Embedder.get_instance()
    dim = embedder.get_embedding_dimension()
    assert dim > 0
    
    chunk = Chunk(
        chunk_id="c1", document_id="d1", set_id="s1", drug_name="DrugX", active_ingredient="A1", section="s1",
        page_number=1, source_file="sf", source_type="pdf", source_identifier="u1", text="This is a medical sentence.",
        ingestion_timestamp="t", extraction_method="pdf_text"
    )
    
    records = embedder.embed_chunks([chunk])
    assert len(records) == 1
    assert len(records[0].embedding) == dim
