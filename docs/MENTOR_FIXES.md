# Cognizant Mentor Fixes — September 2026

## Implemented

### 1. Intent-routed query orchestration
Every `/query` is classified before retrieval into an explicit route:

- `HISTORY_ONLY` — answer from the existing conversation response cache; no vector search.
- `CONTEXTUAL_RAG` — use prior context to resolve the entity, then retrieve authoritative label evidence.
- `LABEL_RAG` — normal drug-label retrieval.
- `FAERS_FREQUENCY` — label retrieval plus openFDA FAERS lookup for frequency/report-count questions.
- `OFF_TOPIC` — no retrieval and no medical-review escalation.
- `PROMPT_INJECTION` / `CORPUS_INJECTION` — policy block, not medical escalation.

The classifier is deliberately lightweight so it does not add a second LLM round-trip to every query.

### 2. FAERS
FAERS is selected by intent instead of a list of adverse-event keywords. The generator is instructed to distinguish spontaneous-report counts from clinical incidence/frequency and to cite FAERS-derived statements separately.

Important correction: aggregated reaction counts are **not** summed and labelled as unique FAERS reports, because one report can contain multiple reactions.

### 3. Per-answer quality metrics
The API now returns:

- `retrieval_precision`
- `answer_correctness`
- `citation_accuracy`

The live values are explicitly marked `estimated=true`. The offline gold-set evaluator remains the benchmark source of truth for objective answer correctness.

### 4. Embedding-model POC
`backend/rag/embedding_benchmark.py` compares:

- `sentence-transformers/all-MiniLM-L6-v2`
- `FremyCompany/BioLORD-2023-M`
- `NeuML/pubmedbert-base-embeddings`

The comparison is run against the same ingested corpus and gold questions, split by patient/clinician mode, and reports Precision@5, Recall@5, MRR, latency, and embedding dimension.

Do not switch the production model until this benchmark has been run on the current corpus.

### 5. Prompt injection response separation
Prompt injection now returns a distinct policy-block response and does not enter the medical human-review queue. It no longer uses the doctor/pharmacist escalation language used for medical safety cases.

Indirect corpus injection is handled separately as `CORPUS_INJECTION`.

## Also fixed

- Repeated approved questions replay the structured cached response, including citations and quality metrics, instead of replaying answer text alone.
- Backend and frontend confidence thresholds now use the backend classification as authoritative.
- Embedding-model configuration accepts both `EMBED_MODEL` and the legacy `EMBEDDING_MODEL` environment variable.
- The frontend displays the three requested quality metrics with every approved answer.

## Remaining validation

1. Run the embedding benchmark on the exact current DailyMed corpus.
2. Run the full gold-set evaluation with the current corpus and model.
3. Manually test FAERS questions against known openFDA results.
4. Test direct and indirect prompt injection cases.
5. Keep the PPT changes separate from the software repository.
