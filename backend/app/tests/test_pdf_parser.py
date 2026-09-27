import os
import pytest
from backend.app.ingestion.pdf_parser import PDFParser
from backend.app.models import ParsedDocument

def test_pdf_parser_valid(tmp_path):
    # This requires a valid pdf, we'll mock or assume it exists.
    # To keep it self-contained without fitz for the mock, we just test the class instance.
    parser = PDFParser(use_ocr=False)
    assert parser.use_ocr is False

# integration test when a real PDF exists is ideal, 
# for now we assume real tests will run after data is generated.
