from sentence_transformers import SentenceTransformer
from backend.app.models import Chunk, EmbeddingRecord
from backend.app.config import Config
from typing import List
import numpy as np

class Embedder:
    _instance = None
    
    def __init__(self):
        # Load model once
        self.model_name = Config.EMBEDDING_MODEL
        self.model = SentenceTransformer(self.model_name)
        
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def embed_chunks(self, chunks: List[Chunk]) -> List[EmbeddingRecord]:
        if not chunks:
            return []
            
        texts = [chunk.text for chunk in chunks]
        
        # Sentence-transformers handles empty strings, but we can pre-filter or replace empty with space
        texts = [t if t.strip() else " " for t in texts]
        
        embeddings = self.model.encode(texts, normalize_embeddings=True)
        
        records = []
        for chunk, embedding in zip(chunks, embeddings):
            records.append(EmbeddingRecord(
                chunk=chunk,
                embedding=embedding.tolist()
            ))
            
        return records
        
    def get_embedding_dimension(self) -> int:
        return self.model.get_sentence_embedding_dimension()
