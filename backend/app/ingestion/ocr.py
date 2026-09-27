import pytesseract
from PIL import Image
import io
from backend.app.models import OCRResult
from backend.app.config import Config

# Set tesseract cmd from config
pytesseract.pytesseract.tesseract_cmd = Config.TESSERACT_CMD

def run_ocr(image_bytes: bytes, page_number: int) -> OCRResult:
    """
    Run OCR on a single page image.
    Returns OCRResult containing text and metadata.
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
        # Get OCR text
        text = pytesseract.image_to_string(image)
        # Get data with confidence (use mean confidence for the page)
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
        confidences = [int(c) for c in data['conf'] if str(c).isdigit() and int(c) != -1]
        
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        
        return OCRResult(
            text=text.strip(),
            page_number=page_number,
            extraction_method="ocr",
            confidence=avg_confidence / 100.0, # scale to 0-1
            success=True
        )
    except Exception as e:
        return OCRResult(
            text="",
            page_number=page_number,
            extraction_method="ocr",
            confidence=0.0,
            success=False
        )

def is_poor_extraction(text: str) -> bool:
    """
    Quality check to determine if OCR is needed.
    """
    if not text or len(text.strip()) < Config.POOR_EXTRACTION_THRESHOLD:
        return True
    
    # Check printable ratio
    printable_chars = sum(1 for c in text if c.isprintable())
    if len(text) > 0 and (printable_chars / len(text)) < Config.PRINTABLE_RATIO_THRESHOLD:
        return True
        
    return False
