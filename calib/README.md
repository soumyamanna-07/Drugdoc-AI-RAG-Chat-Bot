# Current CTS RAG calibration

This tooling is designed for the repository's current architecture. It does **not** create a second vector store or replace the production retriever.

It reuses:

- LanceDB from `backend/rag/vector_store.py`
- hybrid vector + FTS/RRF retrieval from `backend/rag/vector_store.py`
- section reranking from `backend/rag/retriever.py`
- intent routing from `backend/rag/intent.py`
- query understanding from `backend/rag/query_understanding.py`
- relevance gating from `backend/rag/relevance_gate.py`
- the full answer path from `backend/rag/pipeline.py`
- the existing gold/evaluation datasets

## Colab

From the repository root:

```bash
python -m calib.make_questions
python -m calib.calibrate
python -m calib.calibrate --llm 150
```

The first command creates `calib/calibration_questions.csv` from the exact `calib/mentor_100_questions.json` suite, the existing gold sets, mentor-focused routing/FAERS/injection/history cases, and, when available, real drugs in the current LanceDB corpus.

The second command sweeps the current retrieval parameters and writes `calib/calibration_report.json`.

The third command runs the real pipeline on up to 150 questions and reports status accuracy, keyword-based answer checks where gold keywords exist, live quality-metric means, false escalations, unsafe answers, latency, and confidence ECE.

## What is calibrated

- `TOP_K`
- `SECTION_BOOST`
- `MIN_RELEVANCE`
- routing accuracy for `HISTORY_ONLY`, `CONTEXTUAL_RAG`, `FAERS_FREQUENCY`, and off-topic/injection cases
- FAERS routing coverage
- confidence reliability / ECE

The script **does not edit production configuration automatically**. Treat its recommended values as evidence for a manual change after reviewing the report.

## Important interpretation

`Retrieval Precision` in this calibration is an offline proxy based on existing expected chunk IDs/keywords. It is not a human-reviewed universal truth. Live `Answer Correctness` remains an estimate as documented in `backend/rag/quality_metrics.py`.

FAERS values are spontaneous-report counts, not population incidence or clinical-trial percentages.

Generated files are ignored by Git:

- `calib/calibration_questions.csv`
- `calib/calibration_report.json`
