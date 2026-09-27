# Drug Documentation RAG Backend

## 1. Project purpose
This project provides a robust backend pipeline to ingest official drug documentation (PDF and SPL XML formats), apply necessary OCR fallbacks, perform section-aware chunking, assign version tagging and provenance metadata, and finally embed and store the chunks into a LanceDB vector database. The output is a structured vector index and metadata registry fully ready for a RAG (Retrieval-Augmented Generation) retrieval layer.

## 2. Scope of this backend
**Included:**
- PDF and XML Parsers
- OCR fallback for poor-quality PDF text
- Section-aware Chunking
- Version/provenance metadata tagging
- Text Embedding (via SentenceTransformers)
- Vector Storage (via LanceDB)

**Not Included:**
- LLM answer generation, Chatbots, Frontend UI, Authentication, etc.

## 3. Architecture
Input (DailyMed/FDA Official Sources PDF/XML) → Format Detection & Parsing → OCR Fallback (if needed) → Clean Structured Text → Section-aware Chunking → Version/Provenance Tagging → Sentence-Transformer Embedding → LanceDB.

## 4. Folder structure
- `backend/app/`
  - `ingestion/`: Parsing (PDF/XML), Chunker, OCR logic, Pipeline coordinator.
  - `embeddings/`: Sentence-Transformers embedder. Vector storage is provided by the canonical `backend.rag.vector_store` module.
  - `metadata/`: Version tagging & registry.
- `backend/tests/`: Pytest suite.
- `backend/scripts/`: CLI scripts (e.g., `ingest.py`, `verify_ingestion.py`).
- `backend/data/`: Raw data, processed chunks, vector db files.

## 5. Installation
Requires Python 3.10+.
```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r ../../requirements.txt
```

## 6. Tesseract installation
For OCR to work, install Tesseract OCR for Windows from [UB-Mannheim](https://github.com/UB-Mannheim/tesseract/wiki).
After installation, update the `TESSERACT_CMD` in `backend/app/config.py` or `.env` if it's different from the default (`C:\Program Files\Tesseract-OCR\tesseract.exe`).

## 7. Environment configuration
You can use a `.env` file (copy `.env.example`).
Important variables:
- `CHUNK_SIZE`: default 500
- `CHUNK_OVERLAP`: default 50
- `EMBEDDING_MODEL`: default `all-MiniLM-L6-v2`
- `POOR_EXTRACTION_THRESHOLD`: minimum meaningful chars (default 50)
- `PRINTABLE_RATIO_THRESHOLD`: ratio of printable chars (default 0.7)

## 8. Official Data Sources
- Use **DailyMed** as the primary source for official drug-label documentation.
- Support DailyMed **SPL/XML** as the primary structured knowledge-base format.
- Support **PDF** labels where available.
- Use official **FDA sources** for relevant regulatory, safety, labeling, and real-world updates.
- *Do not scrape or depend on unofficial drug-information websites.*
- *Do not hardcode one specific drug.*
- *Preserve the original source URL/source identifier in provenance metadata whenever available.*

## 9. How parser works
`ParserFactory` automatically routes to `PDFParser` or `XMLParser` based on the file extension. `XMLParser` extracts SPL structure, `setId`, `effectiveTime`, `activeIngredient`, and namespaces. `PDFParser` extracts text via `PyMuPDF` (page-by-page).

## 10. OCR fallback logic
After `PyMuPDF` extracts text from a PDF page, the `is_poor_extraction` function checks if the text is empty, under the threshold, or consists of unprintable characters. If poor extraction is detected, it renders the page as an image and uses Tesseract OCR to extract the text. The chunk metadata stores `extraction_method="ocr"` or `"pdf_text"`.

## 11. Chunking strategy
Chunks are grouped logically. For XML, text is chunked within sections. For PDF, it uses paragraphs and falls back to character/word chunking respecting `CHUNK_SIZE` and `CHUNK_OVERLAP`. 

## 12. Version tagging
`VersionManager` maintains a `metadata_registry.json`. Each ingestion writes or updates metadata ensuring that old versions aren't accidentally overwritten but instead coexist in the registry under `drug_name -> version`. Different versions of the same document coexist natively in LanceDB based on their identifiers. FDA updates are treated similarly.

## 13. Embedding model
Using `sentence-transformers` (default `all-MiniLM-L6-v2`). The model converts the chunk texts into vector representations. It gracefully handles empty chunk strings by substituting them with a space.

## 14. LanceDB structure
Uses **LanceDB** database for persistence. Embeddings are stored along with their complete metadata (including source file, page, section, text) in a LanceDB table (default `drug_chunks`). This allows SQL-like filtering in conjunction with vector similarity search. You can inspect/reload the database directly from the `backend/data/vector_db` directory using standard LanceDB `connect()` methods.

## 15. How to ingest PDF
```bash
python backend/scripts/ingest.py --input backend/data/raw/pdf/your_file.pdf --drug-name "Aspirin"
```

## 16. How to ingest XML
```bash
python backend/scripts/ingest.py --input backend/data/raw/xml/your_file.xml
```

## 17. How to run tests
```bash
cd backend
python -m pytest -v
```

## 18. Troubleshooting
- `TesseractNotFoundError`: Ensure Tesseract is installed and path is correct in `Config`.
- `ModuleNotFoundError`: Ensure your virtual environment is activated.

## 19. Known limitations
- PDF section extraction is not 100% accurate because PDFs lack semantic markup.

## 20. What this module outputs for the future RAG layer
- `backend/data/vector_db/`: LanceDB data directory, ready-to-query index.
- `backend/data/vector_db/metadata_registry.json`: Registry mapping drugs to their known versions.
