"""Secure upload expansion for single files and recursive ZIP archives."""
import os
import tempfile
import zipfile
from pathlib import Path

from backend.app.ingestion.export_to_rag_store import parse_and_chunk
from backend.rag.schemas import Chunk

SUPPORTED_SUFFIXES = {".pdf", ".xml", ".png", ".jpg", ".jpeg", ".mp3", ".wav", ".m4a", ".ogg"}
MAX_ARCHIVE_FILES = 100
MAX_ARCHIVE_BYTES = 200 * 1024 * 1024


def _safe_zip_members(archive: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    members = []
    total_size = 0
    for member in archive.infolist():
        if member.is_dir():
            continue
        name = Path(member.filename)
        if name.is_absolute() or ".." in name.parts:
            raise ValueError("ZIP contains an unsafe path.")
        if member.filename.replace("\\", "/").startswith("/"):
            raise ValueError("ZIP contains an unsafe absolute path.")
        if member.external_attr >> 16 & 0o170000 == 0o120000:
            raise ValueError("ZIP symbolic links are not supported.")
        if name.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        total_size += member.file_size
        if total_size > MAX_ARCHIVE_BYTES:
            raise ValueError("ZIP expands beyond the permitted size limit.")
        members.append(member)
    if len(members) > MAX_ARCHIVE_FILES:
        raise ValueError("ZIP contains too many supported files.")
    return members


def parse_upload(path: str, doc_id: str | None, drug_name: str,
                 original_filename: str | None = None) -> list[Chunk]:
    """Parse one supported upload or every supported file in a ZIP archive."""
    suffix = Path(path).suffix.lower()
    if suffix != ".zip":
        return parse_and_chunk(path, doc_id=doc_id, drug_name=drug_name,
                               original_filename=original_filename)

    chunks: list[Chunk] = []
    with zipfile.ZipFile(path) as archive, tempfile.TemporaryDirectory(prefix="drugdoc_zip_") as temp_dir:
        members = _safe_zip_members(archive)
        for index, member in enumerate(members):
            if member.file_size > MAX_ARCHIVE_BYTES:
                raise ValueError("ZIP member exceeds the permitted expanded size limit.")
            destination = Path(temp_dir) / Path(member.filename)
            destination.parent.mkdir(parents=True, exist_ok=True)
            written = 0
            with archive.open(member) as source, destination.open("wb") as target:
                while True:
                    block = source.read(1024 * 1024)
                    if not block:
                        break
                    written += len(block)
                    if written > MAX_ARCHIVE_BYTES:
                        raise ValueError("ZIP member exceeds the permitted expanded size limit.")
                    target.write(block)
            child_id = f"{doc_id or Path(path).stem}_{index}"
            child_name = f"{original_filename or os.path.basename(path)}:{member.filename}"
            chunks.extend(parse_and_chunk(
                str(destination), doc_id=child_id, drug_name=drug_name,
                original_filename=child_name,
            ))
    return chunks