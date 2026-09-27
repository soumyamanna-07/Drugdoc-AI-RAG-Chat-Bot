"""Image and audio adapters that emit the canonical ingestion models."""
import datetime
import os
from pathlib import Path

from backend.app.ingestion.ocr import run_ocr
from backend.app.models import DocumentMetadata, Page, PageBlock, ParsedDocument


class ImageParser:
    def parse(self, file_path: str, doc_id: str, drug_name: str) -> ParsedDocument:
        image_bytes = Path(file_path).read_bytes()
        result = run_ocr(image_bytes, page_number=1)
        if not result.success or not result.text.strip():
            raise ValueError("OCR could not extract readable text from the image.")
        return _document(
            file_path, doc_id, drug_name, result.text, "ocr",
            blocks=[PageBlock(kind="text", text=result.text)],
        )


class AudioParser:
    def parse(self, file_path: str, doc_id: str, drug_name: str) -> ParsedDocument:
        text = transcribe_audio(file_path)
        if not text.strip():
            raise ValueError("Audio transcription returned no text.")
        return _document(
            file_path, doc_id, drug_name, text, "audio_transcription",
            blocks=[PageBlock(kind="text", text=text)],
        )


def transcribe_audio(file_path: str) -> str:
    """Transcribe through the configured Groq Whisper provider.

    The dependency is already used by generation. Failing clearly when no
    provider key exists avoids silently indexing an empty audio document.
    """
    if not os.getenv("GROQ_API_KEY"):
        raise RuntimeError("Audio ingestion requires GROQ_API_KEY for Whisper transcription.")
    from groq import Groq

    with open(file_path, "rb") as audio_file:
        response = Groq().audio.transcriptions.create(
            file=(os.path.basename(file_path), audio_file.read()),
            model=os.getenv("WHISPER_MODEL", "whisper-large-v3-turbo"),
            response_format="text",
        )
    return response if isinstance(response, str) else response.text


def _document(file_path: str, doc_id: str, drug_name: str, text: str,
              extraction_method: str, blocks: list[PageBlock]) -> ParsedDocument:
    filename = os.path.basename(file_path)
    metadata = DocumentMetadata(
        document_id=doc_id or f"{extraction_method}_{filename}",
        drug_name=drug_name or "Unknown Drug",
        active_ingredient="unknown",
        label_version="unknown",
        effective_date="unknown",
        ingestion_timestamp=datetime.datetime.utcnow().isoformat(),
        source_file=filename,
        source_type="image" if extraction_method == "ocr" else "audio",
        source_identifier=filename,
    )
    return ParsedDocument(
        metadata=metadata,
        pages=[Page(page_number=1, text=text, extraction_method=extraction_method,
                    section="General", blocks=blocks)],
        sections=[],
    )