"""Fetch and parse patient-facing brand-source pages and PDFs."""
import datetime
import ipaddress
import os
import socket
import tempfile
import urllib.parse

import requests
from bs4 import BeautifulSoup

from backend.app.ingestion.pdf_parser import PDFParser
from backend.app.models import DocumentMetadata, Page, PageBlock, ParsedDocument

MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024
MAX_REDIRECTS = 3
_HEADERS = {"User-Agent": "DrugDocAI/1.0 medical-document-ingestion"}


def _validate_remote_url(url: str) -> None:
    """Reject URL targets that resolve to local/private network addresses."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Brand source must be an absolute HTTP(S) URL.")
    if parsed.username or parsed.password:
        raise ValueError("Brand source URLs may not contain embedded credentials.")

    hostname = parsed.hostname
    try:
        literal = ipaddress.ip_address(hostname)
        addresses = [literal]
    except ValueError:
        try:
            infos = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
        except OSError as exc:
            raise ValueError("Brand source hostname could not be resolved.") from exc
        addresses = [ipaddress.ip_address(info[4][0]) for info in infos]

    for address in addresses:
        if (address.is_private or address.is_loopback or address.is_link_local
                or address.is_multicast or address.is_unspecified or address.is_reserved):
            raise ValueError("Brand source URL resolves to a private or otherwise restricted network address.")


def _fetch_remote(url: str):
    """Fetch with bounded, revalidated redirects to prevent SSRF via redirects.

    Returns (response, final_url, session). The caller owns the session and
    the final response and is responsible for closing both -- every
    intermediate redirect response along the way is already closed here.
    """
    current = url
    session = requests.Session()
    session.trust_env = False
    try:
        for _ in range(MAX_REDIRECTS + 1):
            _validate_remote_url(current)
            response = session.get(
                current, headers=_HEADERS, timeout=20, stream=True, allow_redirects=False
            )
            if response.is_redirect or response.is_permanent_redirect:
                location = response.headers.get("Location")
                response.close()
                if not location:
                    raise ValueError("Brand source returned an invalid redirect.")
                current = urllib.parse.urljoin(current, location)
                continue
            response.raise_for_status()
            return response, current, session
        raise ValueError("Brand source exceeded the permitted redirect limit.")
    except Exception:
        session.close()
        raise


class BrandSourceParser:
    def parse(self, url: str, doc_id: str | None, drug_name: str) -> ParsedDocument:
        # _fetch_remote's own session/response are only closed on its internal
        # error path; the final, successfully-returned response was leaking
        # here on every call that actually worked. Close both unconditionally.
        response, final_url, session = _fetch_remote(url)
        try:
            url = final_url
            content_type = response.headers.get("content-type", "").lower()
            suffix = os.path.splitext(url.split("?", 1)[0])[1].lower()
            if "pdf" in content_type or suffix == ".pdf":
                return self._parse_pdf(response, url, doc_id, drug_name)
            if "html" not in content_type and content_type:
                raise ValueError(f"Unsupported brand-source content type: {content_type}")
            content = b"".join(response.iter_content(chunk_size=1024 * 1024))
            if len(content) > MAX_DOWNLOAD_BYTES:
                raise ValueError("Brand-source HTML exceeds the permitted size limit.")
            return self._parse_html(content, url, doc_id, drug_name)
        finally:
            response.close()
            session.close()

    @staticmethod
    def _parse_html(content: bytes, url: str, doc_id: str | None,
                    drug_name: str) -> ParsedDocument:
        soup = BeautifulSoup(content, "html.parser")
        for element in soup(["script", "style", "noscript", "nav", "footer"]):
            element.decompose()
        root = soup.find("main") or soup.find("article") or soup.body or soup
        blocks = []
        section = "Brand Information"
        for element in root.find_all(["h1", "h2", "h3", "p", "li"], recursive=True):
            text = " ".join(element.get_text(" ", strip=True).split())
            if not text:
                continue
            if element.name in {"h1", "h2", "h3"}:
                section = text[:200]
                continue
            kind = "list" if element.name == "li" else "text"
            blocks.append(PageBlock(kind=kind, text=text))
        text = "\n".join(block.text for block in blocks)
        return _document(url, doc_id, drug_name, text, blocks, section)

    @staticmethod
    def _parse_pdf(response, url: str, doc_id: str | None,
                   drug_name: str) -> ParsedDocument:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
            size = 0
            for part in response.iter_content(chunk_size=1024 * 1024):
                size += len(part)
                if size > MAX_DOWNLOAD_BYTES:
                    raise ValueError("Brand-source PDF exceeds the permitted size limit.")
                handle.write(part)
            temporary_path = handle.name
        try:
            document = PDFParser(use_ocr=True).parse(
                temporary_path, doc_id or f"brand_pdf_{abs(hash(url))}", drug_name
            )
            document.metadata.source = "brand_site"
            document.metadata.audience = "patient"
            document.metadata.source_url = url
            document.metadata.source_file = url
            document.metadata.original_filename = url.rsplit("/", 1)[-1] or "brand_source.pdf"
            return document
        finally:
            os.unlink(temporary_path)


def _document(url: str, doc_id: str | None, drug_name: str, text: str,
              blocks: list[PageBlock], section: str) -> ParsedDocument:
    return ParsedDocument(
        metadata=DocumentMetadata(
            document_id=doc_id or f"brand_html_{abs(hash(url))}",
            drug_name=drug_name or "Unknown Drug",
            ingestion_timestamp=datetime.datetime.utcnow().isoformat(),
            source_file=url,
            source_type="html",
            source_identifier=url,
            original_filename=url,
            source="brand_site",
            audience="patient",
            source_url=url,
        ),
        pages=[Page(page_number=1, text=text, extraction_method="html",
                    section=section, blocks=blocks)],
        sections=[],
    )
