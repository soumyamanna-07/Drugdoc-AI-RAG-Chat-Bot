import pytest
from backend.app.ingestion.ocr import is_poor_extraction, run_ocr
from PIL import Image
import io
import os

def test_is_poor_extraction():
    assert is_poor_extraction("") == True
    assert is_poor_extraction("   ") == True
    assert is_poor_extraction("short") == True
    assert is_poor_extraction("This is a sufficiently long string that should not trigger poor extraction unless there are too many unprintable characters in the document.") == False

# mock tesseract for testing the interface without depending on tesseract installation for unit tests
def test_run_ocr(monkeypatch):
    def mock_image_to_string(image):
        return "MOCKED OCR TEXT"
    def mock_image_to_data(image, output_type):
        return {'conf': [90, 95, -1]}
    
    import pytesseract
    monkeypatch.setattr(pytesseract, "image_to_string", mock_image_to_string)
    monkeypatch.setattr(pytesseract, "image_to_data", mock_image_to_data)
    
    # create a dummy image bytes
    img = Image.new('RGB', (100, 100))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    image_bytes = buf.getvalue()
    
    res = run_ocr(image_bytes, 2)
    assert res.text == "MOCKED OCR TEXT"
    assert res.page_number == 2
    assert res.extraction_method == "ocr"
    assert res.success == True
    assert res.confidence == 0.925  # (90+95)/2 / 100
