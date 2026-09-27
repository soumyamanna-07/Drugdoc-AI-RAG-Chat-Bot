import os
from backend.app.models import ParsedDocument
from backend.app.ingestion.pdf_parser import PDFParser
from backend.app.ingestion.xml_parser import XMLParser
from backend.app.ingestion.multimodal_parser import ImageParser, AudioParser
from backend.app.ingestion.brand_source_parser import BrandSourceParser

class ParserFactory:
    @staticmethod
    def parse_url(url: str, doc_id: str = None, drug_name: str = None) -> ParsedDocument:
        return BrandSourceParser().parse(url, doc_id, drug_name or "Unknown Drug")

    @staticmethod
    def parse_document(file_path: str, doc_id: str = None, drug_name: str = None,
                       use_ocr: bool = True, original_filename: str = None) -> ParsedDocument:
        ext = os.path.splitext(file_path)[1].lower()
        if ext == '.pdf':
            if not doc_id: doc_id = f"pdf_{os.path.basename(file_path)}"
            if not drug_name: drug_name = "Unknown Drug"
            parser = PDFParser(use_ocr=use_ocr)
            doc = parser.parse(file_path, doc_id, drug_name)
        elif ext == '.xml':
            parser = XMLParser()
            doc = parser.parse(file_path, doc_id, drug_name)
        elif ext in {'.png', '.jpg', '.jpeg'}:
            parser = ImageParser()
            doc = parser.parse(file_path, doc_id, drug_name)
        elif ext in {'.mp3', '.wav', '.m4a', '.ogg'}:
            parser = AudioParser()
            doc = parser.parse(file_path, doc_id, drug_name)
        else:
            raise ValueError(f"Unsupported file extension: {ext}")
        doc.metadata.original_filename = original_filename or os.path.basename(file_path)
        return doc
