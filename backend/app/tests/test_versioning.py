import pytest
import os
from backend.app.metadata.versioning import VersionManager
from backend.app.models import ParsedDocument, DocumentMetadata, Page

def test_version_tagging(tmp_path):
    mgr = VersionManager(storage_dir=str(tmp_path))
    
    meta1 = DocumentMetadata(
        document_id="doc1", set_id="set1", drug_name="Aspirin", active_ingredient="Aspirin", label_version="v1",
        ingestion_timestamp="now", source_file="f1", source_type="pdf", source_identifier="url1"
    )
    doc1 = ParsedDocument(metadata=meta1, pages=[], sections=[])
    
    mgr.tag_document(doc1)
    
    # check registry
    registry = mgr.load_registry()
    assert "Aspirin" in registry
    assert "v1" in registry["Aspirin"]
    
    # Add new version
    meta2 = DocumentMetadata(
        document_id="doc2", set_id="set1", drug_name="Aspirin", active_ingredient="Aspirin", label_version="v2",
        ingestion_timestamp="now", source_file="f2", source_type="pdf", source_identifier="url2"
    )
    doc2 = ParsedDocument(metadata=meta2, pages=[], sections=[])
    mgr.tag_document(doc2)
    
    registry = mgr.load_registry()
    assert "v2" in registry["Aspirin"]
    assert "v1" in registry["Aspirin"] # old version still exists
