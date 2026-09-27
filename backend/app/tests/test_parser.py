import pytest
from backend.app.ingestion.parser import ParserFactory
from backend.app.ingestion.pdf_parser import PDFParser
from backend.app.ingestion.xml_parser import XMLParser
from backend.app.models import ParsedDocument

def test_pdf_parser(test_pdf_path):
    parser = PDFParser(use_ocr=False)
    doc = parser.parse(test_pdf_path, doc_id="doc1", drug_name="Drug PDF")
    assert isinstance(doc, ParsedDocument)
    assert len(doc.pages) == 1
    assert "TEST DATA" in doc.pages[0].text
    assert doc.metadata.source_type == "pdf"

def test_xml_parser(test_xml_path):
    parser = XMLParser()
    doc = parser.parse(test_xml_path)
    assert isinstance(doc, ParsedDocument)
    assert len(doc.pages) == 1
    assert len(doc.sections) == 1
    assert doc.sections[0].title == "Indications and Usage"
    assert "TEST DATA" in doc.sections[0].text
    assert doc.metadata.source_type == "xml"
    assert doc.metadata.document_id == "test-id-123"
    assert doc.metadata.set_id == "set-id-456"
    assert doc.metadata.label_version == "2"
    assert doc.metadata.effective_date == "2026-09-18"
    assert doc.metadata.drug_name == "Test Drug"
    assert doc.metadata.active_ingredient == "Active Ingredient X"
    assert doc.metadata.source_identifier == "http://dailymed.example.com/test"

def test_parser_factory_pdf(test_pdf_path):
    doc = ParserFactory.parse_document(test_pdf_path)
    assert doc.metadata.source_type == "pdf"
    
def test_parser_factory_xml(test_xml_path):
    doc = ParserFactory.parse_document(test_xml_path)
    assert doc.metadata.source_type == "xml"
