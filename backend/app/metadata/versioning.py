from backend.app.models import DocumentMetadata, ParsedDocument
from backend.paths import DATA_DIR
from typing import Optional
import json
import os

class VersionManager:
    def __init__(self, storage_dir: str = None):
        self.storage_dir = storage_dir or str(DATA_DIR / "vector_db")
        self.metadata_registry = os.path.join(self.storage_dir, "metadata_registry.json")
        os.makedirs(self.storage_dir, exist_ok=True)

    def load_registry(self) -> dict:
        if os.path.exists(self.metadata_registry):
            with open(self.metadata_registry, 'r') as f:
                return json.load(f)
        return {}

    def save_registry(self, registry: dict):
        with open(self.metadata_registry, 'w') as f:
            json.dump(registry, f, indent=4)

    def tag_document(self, doc: ParsedDocument) -> ParsedDocument:
        registry = self.load_registry()
        drug = doc.metadata.drug_name
        doc_id = doc.metadata.document_id
        version = doc.metadata.label_version
        
        # Simple registry logic to ensure unique versions are tracked and not overwritten accidentally
        if drug not in registry:
            registry[drug] = {}
            
        if version in registry[drug]:
            # Handle existing version if needed
            # In a real app, you might choose to update or skip. Here we just update the registry.
            pass
            
        registry[drug][version] = doc.metadata.model_dump()
        self.save_registry(registry)
        
        return doc
