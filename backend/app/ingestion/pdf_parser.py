import fitz
from backend.app.models import Page, PageBlock, ParsedDocument, DocumentMetadata
from backend.app.ingestion.ocr import is_poor_extraction, run_ocr
import datetime
import os
import re


SECTION_HEADINGS = {
    "INDICATIONS AND USAGE": "Indications and Usage",
    "DOSAGE AND ADMINISTRATION": "Dosage and Administration",
    "DOSAGE & ADMINISTRATION": "Dosage and Administration",
    "CONTRAINDICATIONS": "Contraindications",
    "WARNINGS AND PRECAUTIONS": "Warnings and Precautions",
    "ADVERSE REACTIONS": "Adverse Reactions",
    "USE IN SPECIFIC POPULATIONS": "Use in Specific Populations",
    "DESCRIPTION": "Description",
    "CLINICAL PHARMACOLOGY": "Clinical Pharmacology",
    "HOW SUPPLIED": "How Supplied",
    "PATIENT COUNSELING INFORMATION": "Patient Counseling Information",
}

class PDFParser:
    def __init__(self, use_ocr: bool = True):
        self.use_ocr = use_ocr

    def parse(self, file_path: str, doc_id: str, drug_name: str) -> ParsedDocument:
        """
        Parse a PDF file page by page.
        Applies OCR fallback if extraction quality is poor.
        """
        doc = fitz.open(file_path)
        pages = []
        current_section = "General"
        pdf_metadata = doc.metadata or {}
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            text, blocks = self._extract_layout_content(page)
            
            extraction_method = "pdf_text"
            
            if self.use_ocr and is_poor_extraction(text):
                # Need OCR fallback
                pix = page.get_pixmap(dpi=300)
                image_bytes = pix.tobytes("png")
                ocr_result = run_ocr(image_bytes, page_number=page_num + 1)
                
                if ocr_result.success and len(ocr_result.text.strip()) > 0:
                    text = ocr_result.text
                    blocks = [PageBlock(kind="text", text=text)] if text.strip() else []
                    extraction_method = "ocr"
                else:
                    text = "" # Fallback failed or empty

            detected_section = self._section_from_text(text)
            if detected_section:
                current_section = detected_section
            
            pages.append(Page(
                page_number=page_num + 1,
                text=text,
                extraction_method=extraction_method,
                section=current_section,
                blocks=blocks,
            ))

        full_text = "\n".join(page.text for page in pages)
        header_text = "\n".join(page.text for page in pages[:2])
        metadata_text = "\n".join(str(pdf_metadata.get(key) or "")
                        for key in ("title", "subject", "keywords", "modDate", "creationDate"))
        label_version = self._extract_version("\n".join((metadata_text, header_text, full_text)))
        effective_date = self._extract_date("\n".join((metadata_text, header_text, full_text)))
        active_ingredient = self._extract_value(
            full_text, r"(?:active\s+ingredient|generic\s+name)\s*[:\-]\s*([^\n;]+)"
        )
            
        metadata = DocumentMetadata(
            document_id=doc_id,
            set_id="unknown",
            drug_name=drug_name,
            active_ingredient=active_ingredient or "unknown",
            label_version=label_version or "unknown",
            effective_date=effective_date or "unknown",
            ingestion_timestamp=datetime.datetime.utcnow().isoformat(),
            source_file=os.path.basename(file_path),
            source_type="pdf",
            source_identifier=os.path.basename(file_path)
        )
        
        return ParsedDocument(metadata=metadata, pages=pages, sections=[])

    @staticmethod
    def _extract_layout_text(page) -> str:
        """Read sorted text blocks so headers and section titles survive columns."""
        text, _ = PDFParser._extract_layout_content(page)
        return text

    @staticmethod
    def _extract_layout_content(page) -> tuple[str, list[PageBlock]]:
        """Extract ordered text, lists, and intact PyMuPDF table blocks."""
        table_objects = []
        try:
            finder = page.find_tables()
            table_objects = list(getattr(finder, "tables", finder or []))
        except (AttributeError, TypeError, ValueError):
            # Older PyMuPDF builds or image-only pages may not expose table detection.
            pass

        table_bounds = [table.bbox for table in table_objects]
        blocks = page.get_text("blocks", sort=True)
        content: list[tuple[float, PageBlock]] = []
        for block in blocks:
            if len(block) < 5 or not block[4].strip():
                continue
            center_x = (float(block[0]) + float(block[2])) / 2
            center_y = (float(block[1]) + float(block[3])) / 2
            if any(x0 <= center_x <= x1 and y0 <= center_y <= y1
                   for x0, y0, x1, y1 in table_bounds):
                continue
            block_text = block[4].strip()
            kind = "list" if PDFParser._is_list(block_text) else "text"
            content.append((float(block[1]), PageBlock(kind=kind, text=block_text)))

        for table in table_objects:
            rows = table.extract()
            table_text = PDFParser._format_table(rows)
            if table_text:
                content.append((float(table.bbox[1]), PageBlock(kind="table", text=table_text)))

        content.sort(key=lambda item: item[0])
        ordered = [item[1] for item in content]
        return "\n\n".join(item.text for item in ordered), ordered

    @staticmethod
    def _is_list(text: str) -> bool:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return bool(lines) and sum(bool(re.match(r"^(?:[-*•]|\d+[.)])\s+", line))
                                              for line in lines) >= max(1, len(lines) // 2)

    @staticmethod
    def _format_table(rows) -> str:
        if not rows:
            return ""
        normalized = []
        for row in rows:
            cells = [re.sub(r"\s+", " ", str(cell or "")).strip() for cell in row]
            if any(cells):
                normalized.append(" | ".join(cells))
        return "\n".join(normalized)

    @staticmethod
    def _section_from_text(text: str) -> str | None:
        for line in text.splitlines():
            candidate = re.sub(r"^\s*(?:\d+(?:\.\d+)*[.)]?\s*[-:]?\s*)", "", line).strip()
            normalized = re.sub(r"\s+", " ", candidate).upper().rstrip(":")
            if normalized in SECTION_HEADINGS:
                return SECTION_HEADINGS[normalized]
        return None

    @staticmethod
    def _extract_value(text: str, pattern: str) -> str | None:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        return match.group(1).strip() if match else None

    @classmethod
    def _extract_version(cls, text: str) -> str | None:
        return cls._extract_value(
            text,
            r"(?:version|label\s+version|revision\s*(?:number|no\.)?|document\s+number)\s*[:#-]?\s*([vV]?\d+(?:\.\d+){0,3})",
        )

    @classmethod
    def _extract_date(cls, text: str) -> str | None:
        value = cls._extract_value(
            text,
            r"(?:effective|revision|revised|updated|last\s+updated|label\s+date)\s*date?\s*[:#-]?\s*([0-9]{4}[-/]\d{1,2}[-/]\d{1,2}|[0-9]{1,2}[-/]\d{1,2}[-/]\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})",
        )
        if not value:
            return None
        for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%m/%d/%Y", "%B %d, %Y", "%B %d %Y"):
            try:
                return datetime.datetime.strptime(value, fmt).date().isoformat()
            except ValueError:
                continue
        return value
