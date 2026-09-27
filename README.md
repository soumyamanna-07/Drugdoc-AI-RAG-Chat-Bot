@'
# DrugDoc AI — Q&A Chatbot for Drug Documentation

A retrieval-augmented (RAG) chatbot that answers medication questions from official drug labels, with inline citations, two audience modes, and safety checks that escalate rather than guess.

Built as a 6-person team project for a Cognizant hackathon.
**My contribution: the RAG and safety layer** — query understanding, retrieval, relevance gate, generation call, and the citation engine (`backend/rag/`).

## What it does

- Ingests official drug labels (PDF / SPL XML, with OCR fallback) and indexes them section by section
- Answers in **clinician** or **patient** mode: same evidence, different wording
- Cites every factual claim back to a document, section and page
- **Escalates instead of answering** when the evidence is weak or the answer cannot be verified

## Safety layer (the interesting part)

Most RAG failures are confident and wrong. These checks catch them:

| Check | What it catches |
|---|---|
| Unknown-drug detection | A question about a drug that was never uploaded |
| Number verification | A dose, age or lab value that is not in the cited source |
| High-risk topic grounding | "Safe in pregnancy?" answered from a source that never mentions pregnancy |
| Fake-citation removal | The model citing an excerpt that does not exist |
| Citation coverage | Answers where too many statements are uncited |
| Prompt-injection guard | Instructions hidden in the query or in an uploaded document |

A real example caught by topic grounding: the model produced *"No, metformin is contraindicated in pregnant women [3]."* — fluent, confidently worded, and citing a real excerpt that never mentions pregnancy. It was escalated instead of shown.

## Evaluation

18-question set (12 answerable, 6 that must be refused):

| Metric | Result |
|---|---|
| Retrieval Hit@1 / MRR | 100% / 1.0 |
| Answer correctness | 12/12 |
| Citation accuracy | 12/12 |
| Correct escalations | 6/6 |
| **Unsafe answers** | **0** |
| False escalations | 0 |

Measured on a small sample corpus. The thresholds are re-tuned on real labels with the calibration harness in `calib/`.

## Stack

React + TypeScript + Vite · FastAPI · LanceDB · sentence-transformers (all-MiniLM-L6-v2) · Groq API with local Ollama fallback · Presidio + spaCy for PII redaction · SQLite · hash-chained JSONL audit log

## Running it locally

Requires Python 3.11 (numpy and pyarrow have no wheels for 3.12+).

~~~bash
python -m venv .venv
.venv\Scripts\Activate.ps1        # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
copy .env.example .env            # then set ADMIN_PASSWORD and AUTH_SECRET
python -m uvicorn backend.main:app --port 8000
~~~

In a second terminal:

~~~bash
cd DrugDocAI-Frontend
npm install
npm run dev
~~~

Open http://localhost:5173, sign in as admin, upload a drug label, then ask questions as a user.

Generation uses Groq when `GROQ_API_KEY` is set, and falls back to a local Ollama model otherwise.

## Repository layout

~~~
backend/rag/        retrieval, relevance gate, generation, citations  (my part)
backend/app/        ingestion: parsing, chunking, embedding
backend/safety/     injection guard, PII redaction, audit log, review queue, auth
calib/              calibration harness for tuning thresholds on real data
docs/               embedding benchmark and design notes
DrugDocAI-Frontend/ React app: chat, mode selection, admin dashboard
~~~

## Note

Educational project. Not a medical device and not a source of medical advice.
'@ | Set-Content -Path README.md -Encoding utf8
git add README.md; git commit -q -m "Add README"; git push -q; Write-Host "README pushed"
