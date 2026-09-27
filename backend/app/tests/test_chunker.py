import pytest
from backend.app.ingestion.chunker import Chunker
from backend.app.models import ParsedDocument, Page, PageBlock, DocumentMetadata, Section

def test_chunker_basic():
    chunker = Chunker(chunk_size=50, chunk_overlap=10)
    
    meta = DocumentMetadata(
        document_id="d1", set_id="s1", drug_name="Drug1", active_ingredient="A1",
        ingestion_timestamp="2026", source_file="f", source_type="pdf", source_identifier="u1"
    )
    doc = ParsedDocument(
        metadata=meta,
        pages=[Page(page_number=1, text="This is a test document.\n\nIt has multiple paragraphs.\n\nWe need to chunk it.")],
        sections=[]
    )
    
    chunks = chunker.chunk_document(doc)
    assert len(chunks) > 0
    assert chunks[0].document_id == "d1"
    assert chunks[0].page_number == 1
    assert chunks[0].set_id == "s1"

def test_chunker_sections():
    chunker = Chunker(chunk_size=100)
    meta = DocumentMetadata(
        document_id="d2", set_id="s2", drug_name="Drug2", active_ingredient="A2",
        ingestion_timestamp="2026", source_file="f", source_type="xml", source_identifier="u2"
    )
    doc = ParsedDocument(
        metadata=meta,
        pages=[],
        sections=[Section(title="Indications", text="Use this for testing.")]
    )
    
    chunks = chunker.chunk_document(doc)
    assert len(chunks) == 1
    assert chunks[0].section == "Indications"
    assert chunks[0].source_type == "xml"


def test_split_text_packs_complete_sentences():
    chunker = Chunker(chunk_size=45, chunk_overlap=10)

    chunks = chunker._split_text(
        "First sentence is complete. Second sentence is also complete. "
        "Third sentence finishes the example."
    )

    assert len(chunks) == 3
    assert all(chunk.endswith((".", "!", "?")) for chunk in chunks)
    assert all(len(chunk) <= 45 for chunk in chunks)


def test_split_text_bounds_a_single_long_sentence():
    chunker = Chunker(chunk_size=20, chunk_overlap=5)

    chunks = chunker._split_text("This sentence is deliberately much longer than one chunk.")

    assert len(chunks) > 1
    assert all(len(chunk) <= 20 for chunk in chunks)


def test_split_text_ignores_blank_input():
    assert Chunker(chunk_size=20)._split_text(" \n\n ") == []


def test_table_block_is_atomic_and_keeps_section_header():
    meta = DocumentMetadata(
        document_id="d3", drug_name="metformin", ingestion_timestamp="2026",
        source_file="label.pdf", source_type="pdf",
    )
    table = "Adverse reaction | Metformin | Placebo\nDiarrhea | 53% | 12%\nNausea | 26% | 8%"
    doc = ParsedDocument(
        metadata=meta,
        pages=[Page(
            page_number=2,
            text=table,
            section="Adverse Reactions",
            blocks=[PageBlock(kind="table", text=table)],
        )],
        sections=[],
    )

    chunks = Chunker(chunk_size=20, chunk_overlap=5).chunk_document(doc)

    assert len(chunks) == 1
    assert chunks[0].text.startswith("Section: Adverse Reactions")
    assert "Diarrhea | 53% | 12%" in chunks[0].text
