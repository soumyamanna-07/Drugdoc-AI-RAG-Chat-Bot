import os
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict, Literal

class DocumentMetadata(BaseModel):
    document_id: str
    set_id: Optional[str] = "unknown"
    drug_name: str
    active_ingredient: Optional[str] = "unknown"
    label_version: Optional[str] = "unknown"
    effective_date: Optional[str] = "unknown"
    ingestion_timestamp: str
    source_file: str
    source_type: str
    source_identifier: Optional[str] = "unknown"
    original_filename: Optional[str] = None
    source: str = "label"
    audience: str = "clinician"
    source_url: Optional[str] = None

class Section(BaseModel):
    title: str
    text: str
    subsections: List['Section'] = Field(default_factory=list)


class PageBlock(BaseModel):
    """Ordered content unit emitted by layout-aware PDF extraction."""
    kind: Literal["text", "table", "list"] = "text"
    text: str


class Page(BaseModel):
    page_number: int
    text: str
    extraction_method: str = "pdf_text"
    section: str = "General"
    subsection: Optional[str] = None
    blocks: List[PageBlock] = Field(default_factory=list)

class ParsedDocument(BaseModel):
    metadata: DocumentMetadata
    pages: List[Page]
    sections: List[Section]

class Chunk(BaseModel):
    chunk_id: str
    document_id: str
    set_id: Optional[str] = "unknown"
    drug_name: str
    active_ingredient: Optional[str] = "unknown"
    section: str
    subsection: Optional[str] = None
    page_number: int
    source_file: str
    source_type: str
    source_identifier: Optional[str] = "unknown"
    text: str
    label_version: Optional[str] = "unknown"
    effective_date: Optional[str] = "unknown"
    ingestion_timestamp: str
    extraction_method: str
    original_filename: Optional[str] = None
    source: str = "label"
    audience: str = "clinician"
    source_url: Optional[str] = None

class EmbeddingRecord(BaseModel):
    chunk: Chunk
    embedding: List[float]


class OCRResult(BaseModel):
    text: str
    page_number: int
    extraction_method: str = "ocr"
    confidence: float
    success: bool
