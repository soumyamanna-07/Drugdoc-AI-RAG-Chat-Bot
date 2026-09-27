import io
import zipfile

import pytest

from backend.app.ingestion.multimodal_parser import ImageParser
from backend.app.ingestion.upload_dispatcher import _safe_zip_members


def test_zip_rejects_path_traversal():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("../outside.txt", "unsafe")
    buffer.seek(0)
    with zipfile.ZipFile(buffer) as archive:
        with pytest.raises(ValueError, match="unsafe path"):
            _safe_zip_members(archive)


def test_image_parser_emits_page_block(monkeypatch, tmp_path):
    image_path = tmp_path / "label.png"
    image_path.write_bytes(b"image")

    class Result:
        text = "Metformin dose is 500 mg."
        success = True

    monkeypatch.setattr("backend.app.ingestion.multimodal_parser.run_ocr", lambda *args, **kwargs: Result())

    document = ImageParser().parse(str(image_path), "img-1", "metformin")

    assert document.metadata.source_type == "image"
    assert document.pages[0].blocks[0].kind == "text"
    assert document.pages[0].blocks[0].text == Result.text