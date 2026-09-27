# DrugDocQA — Technical Architecture & Stack

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | FastAPI (Python), uvicorn |
| Frontend | React + TypeScript + Vite, React Router |
| Vector store | LanceDB (embedded, file-based) |
| Embeddings | sentence-transformers (`all-MiniLM-L6-v2`) |
| Generation | Groq API (primary) → Ollama (local fallback) |
| Parsing | PyMuPDF (PDF), lxml (SPL XML), pytesseract (OCR fallback) |
| PII/PHI redaction | Microsoft Presidio + spaCy (`en_core_web_sm`) |
| Auth | Custom: SQLite users, scrypt password hashing, HMAC-signed bearer tokens, Google OAuth |
| Session memory | LangChain message objects, persisted to SQLite |
| Persistent state | SQLite (auth, sessions, rate limits, analytics) + append-only JSONL (audit log) + JSON (review queue, ingest jobs) |
| Rate limiting | Custom middleware, SQLite-backed |
| Orchestration | Plain Python — no LangChain agent framework in the query path (LangChain used only for chat memory objects) |

## 2. Query pipeline

```
POST /query
  → injection scan (raw query text) → reject if flagged
  → mode-consistency gate (patient asking clinician-level Q?) → escalate (high risk)
  → chat-memory check: near-exact repeat of last question? → return cached answer, skip retrieval
  → pipeline.answer():
      understand() — drug extraction (+ brand→generic aliasing), follow-up
                      resolution from session history, section-hint detection
      → retrieve() — vector search, filtered by drug name + section hints
      → injection scan (retrieved chunks) → escalate (high risk) if flagged
      → relevance gate — enough evidence? right drug? → escalate (risk: none
        if off-topic / no drug identified, low if a real drug question with
        weak evidence)
      → generate() — Groq, falls back to Ollama on failure
      → redact() — PII/PHI removed BEFORE citation processing, fails closed
      → citation processing — validates every claim traces to a retrieved
        chunk, computes citation coverage
      → confidence calibration → bucket (low/medium/high)
  → APPROVED → answer + citations returned
  → ESCALATED → human review queue entry (skipped for off-topic questions)
```

## 3. Ingestion pipeline

```
POST /ingest (auth: admin bearer token)
  → file written to permanent path immediately (job-id-prefixed, collision-safe)
  → submitted to a bounded thread pool (3 workers) — request returns a job_id
    right away, doesn't block on parsing/embedding
  → parse + chunk (PDF/XML, OCR fallback)
  → 0 extractable chunks → FAILED (was silently "stored" before)
  → injection scan on every chunk → any flagged → REJECTED, nothing stored
  → embed + write to LanceDB (atomic upsert where supported)
  → only now: register document version/metadata (after storage succeeds,
    not before — a failed/rejected doc no longer leaves a phantom record)
  → known-drug list cache invalidated so the new drug is queryable immediately
GET /ingest/{job_id}/status — poll for progress (exempt from rate limiting)
```

## 4. Auth

- Email/password: scrypt-hashed, stored in SQLite, HMAC-signed bearer tokens (1hr TTL)
- Google OAuth: state-token CSRF protection, links to existing account by email or creates one
- Admin role: bootstrapped via `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars on startup, or promoted manually
- Frontend stores the bearer token in `sessionStorage` (cleared on tab close/logout)
- `/admin/*` routes are guarded client-side (redirect if no token) and every admin API call is enforced server-side regardless (`Depends(require_admin_key)` — despite the name, checks the bearer token + admin role, not a shared key)

## 5. Safety spine

- **Redaction**: fails closed — if the model isn't available, escalates rather than serving unprotected text
- **Injection defense**: scans the live query, retrieved chunks, and every ingested chunk before storage; explicit `<context>`/`<instructions>` delimiting in the LLM prompt
- **Audit log**: hash-chained (tamper-evident), append-only JSONL, thread-safe
- **Review queue**: disk-persisted, thread-safe; off-topic questions don't enter it
- **Right-to-erasure**: `DELETE /session/{id}` clears chat memory (audit log is untouched by design — it's built to never hold raw PII in the first place)

## 6. Known open gaps

The core mentor-requested orchestration, FAERS routing, live quality-metric reporting, embedding-model benchmarking, and injection-specific handling are now implemented. The remaining gaps are primarily validation, production hardening, and operational persistence:

1. **Confidence-bucket calibration**
   A LanceDB-aware calibration harness now exists under `calib/` and evaluates the current retrieval, routing, and full-pipeline paths without creating a second retriever. The production confidence thresholds are still provisional until the harness is run against the current corpus and sufficiently reviewed/gold-labelled answers. See `backend/rag/confidence.py` and `calib/README.md`.

2. **PDF metadata extraction remains heuristic for arbitrary layouts**
   The PDF ingestion pipeline supports structured extraction and OCR fallback, but section/version/effective-date detection can still be imperfect for labels with unusual layouts or formatting. Further validation against a broader collection of DailyMed/FDA label formats is required.

3. **Embedding-model selection requires empirical completion**
   A benchmark harness now compares `all-MiniLM-L6-v2`, `FremyCompany/BioLORD-2023-M`, and `NeuML/pubmedbert-base-embeddings`. The benchmark infrastructure is implemented, but the final model decision should be based on measured patient-mode and clinician-mode retrieval performance on the project's gold/evaluation set rather than assumption.

4. **Per-query quality metrics are evaluator estimates, not ground truth**
   Retrieval Precision, Answer Correctness, and Citation Accuracy are now exposed with responses. For live queries, these values should be understood as automated/evaluator estimates. Definitive benchmark results require a reference/gold answer set and human-reviewed validation data.

5. **Dashboard historical analytics require continued validation**
   Live dashboard statistics are available, but historical activity/source-type analytics should be verified against persisted event data before being described as production-grade analytics. Any remaining static presentation values should be replaced with backend-derived historical data.

6. **Dependency reproducibility across requirement files**
   The checked-in Python requirement files are version-pinned. A final deployment pass should still verify that the overlapping requirement files remain mutually compatible and that frontend dependencies are locked by the frontend package lock file.

7. **Colab persistence remains an operational limitation**
   Authentication, sessions, rate-limit state, audit data, and other SQLite/disk-backed state under `data/` can be lost when a Colab runtime is reset. This is acceptable for the current hackathon/demo environment but should be moved to persistent storage or an external database for deployment.

8. **FAERS coverage and semantics require continued validation**
   FAERS frequency/report-count queries are now routed through the intent layer and clearly separated from official-label evidence. However, FAERS values represent spontaneous safety reports and must not be interpreted as population incidence rates. Additional validation is required for drug-name matching, multiple-drug queries, date ranges, and partial API failures.

9. **History-only responses require provenance-aware validation**
   The system can answer some conversational follow-ups from session context without performing a new vector search. These responses must remain clearly distinguished from answers grounded in authoritative drug-label evidence. Factual questions that require verification should continue to force retrieval rather than relying solely on previous assistant output.

10. **Multi-drug and ambiguous-entity queries need broader evaluation**
    Drug extraction, alias resolution, and conversational follow-up handling are implemented, but complex questions involving multiple drugs, ambiguous references, or several simultaneous evidence sources require additional benchmark cases.

11. **Failure-path testing remains ongoing**
    Additional automated tests should cover FAERS timeouts/unavailability, model-provider failures, empty retrieval, citation failures, prompt injection through retrieved documents, long multi-turn sessions, duplicate requests, and partial-response behavior.

12. **Human-reviewed evaluation remains the final validation step**
    The automated evaluation suite provides regression and benchmark support, but final confidence in retrieval precision, answer correctness, citation accuracy, safety routing, and patient/clinician behavior should be established using a reviewed evaluation set.


## Intent-Orchestrated Retrieval 

The query path now uses a lightweight intent-routing layer before retrieval. The router determines whether the request can be answered from conversational context, requires authoritative label retrieval, requires supplementary FAERS data, requires both sources, or should be handled by a safety/off-topic pathway.

```text
User query
    ↓
Injection / safety pre-check
    ↓
Intent classification
    ├── HISTORY_ONLY → conversation context
    ├── LABEL_RAG → vector retrieval
    ├── FAERS_FREQUENCY → label retrieval + FAERS
    ├── CONTEXTUAL_RAG → history + vector retrieval
    ├── OFF_TOPIC → scoped response
    └── INJECTION → injection-specific response
    ↓
Evidence / context assembly
    ↓
Generation
    ↓
Redaction + citation validation
    ↓
Confidence / safety checks
    ↓
Quality metrics
    ├── Retrieval Precision
    ├── Answer Correctness
    └── Citation Accuracy
    ↓
Final response
```

The API exposes intent-routing information including `intent`, `retrieval_used`, `history_used`, and `faers_used`, together with the three requested quality metrics.

For live queries, the three quality metrics are explicitly treated as automated estimates rather than ground-truth measurements. The gold-standard evaluation suite remains the authoritative mechanism for benchmark reporting.

FAERS evidence is kept distinct from official prescribing-information evidence. FAERS is used for spontaneous adverse-event reporting/frequency-style questions and is not interpreted as a population incidence rate.

The system also distinguishes prompt-injection handling from medical-risk escalation, so an injection attempt does not receive the same response pathway as a high-risk clinical question.
