# RAG Backend: Retrieval, Relevance Gate, Generation, Citations

Owner: Soumya Manna. This module takes a user question (plus the selected mode) and returns a grounded, cited answer, or escalates when the evidence is not reliable.

## Flow

~~~
question + mode
  -> query_understanding   drug extraction (typo-tolerant), follow-up memory (LangChain), section hints
  -> retriever             Chroma search, drug filter, section-aware re-ranking
  -> relevance_gate        unknown-drug check, similarity thresholds
  -> generator             Llama 3 via Ollama (Groq if GROQ_API_KEY is set), clinician/patient prompts
  -> citation              [n] -> doc/section/page, fake-citation removal, auto-citation,
                           number verification, high-risk topic grounding, coverage
  -> RAGResponse JSON      APPROVED or ESCALATED
~~~

## Files

| File | Purpose |
|---|---|
| `schemas.py` | Data contracts: `Chunk`, `QueryInfo`, `Citation`, `RAGResponse` |
| `config.py` | All settings and thresholds |
| `vector_store.py` | Chroma collection, embeddings, `add_chunks()` |
| `query_understanding.py` | Drug extraction, follow-up resolution, section hints |
| `retriever.py` | Top-K retrieval with drug filter and section boost |
| `relevance_gate.py` | Decides if evidence is strong enough to answer |
| `generator.py` | Grounded LLM call with persona prompts |
| `citation.py` | Citation mapping, validation, auto-citation, number and topic checks |
| `pipeline.py` | `answer()` connects everything; test console |
| `evaluate.py` | Runs the evaluation set and reports metrics |
| `eval_set.json` | Evaluation questions (add more here, no code change needed) |
| `eval_results.json` | Latest evaluation results |
| `sample_chunks.py` | Test data only (until real labels are ingested) |

## Setup (Windows, Python 3.11)

~~~powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r ../../requirements.txt
~~~

Install Ollama from https://ollama.com/download, then download the model:

~~~powershell
python -c 'import ollama; ollama.pull("llama3.2")'
~~~

Load test data and try it:

~~~powershell
python -m backend.rag.vector_store     # loads sample chunks into Chroma
python -m backend.rag.pipeline         # interactive console: pick mode, ask questions
python -m backend.rag.evaluate         # run the evaluation
~~~

Each module can be tested alone, e.g. `python -m backend.rag.retriever`.

## How other parts connect

**Frontend / orchestrator:** call one function.

~~~python
from backend.rag.pipeline import answer

response = answer("What is the maximum dose of metformin?", mode="patient", session_id="user-123")
print(response.model_dump_json())
~~~

`session_id` keeps each user's conversation memory separate (use one per chat session).

Example response:

~~~json
{
  "mode": "patient",
  "answer": "The maximum dose of metformin is 2550 mg per day [1].",
  "citations": [{"chunk_id": "met-dose-1", "doc": "metformin_label.pdf",
                 "section": "Dosage and Administration", "page": 4}],
  "status": "APPROVED",
  "confidence": 0.82,
  "reason": null
}
~~~

When `status` is `ESCALATED`, `answer` holds a safe fallback message and `reason` says why.

**Ingestion:** produce `Chunk` objects (see `schemas.py`) and store them with:

~~~python
from backend.rag.vector_store import add_chunks
add_chunks(list_of_chunks)
~~~

Requirements for ingestion:
- `drug_name` in lowercase generic form (e.g. `metformin`), used for filtering
- `section` = the label section title (any style works, e.g. `6 ADVERSE REACTIONS`)
- `source_file` and `page` filled in, used for citations
- Same embedding model as `config.EMBED_MODEL` (`add_chunks()` handles this automatically)

## Safety behaviour

| Situation | Result |
|---|---|
| Question names a drug not in the documents | ESCALATED |
| No drug identified and weak match | ESCALATED (stricter threshold) |
| Best evidence below `MIN_RELEVANCE` | ESCALATED |
| Model says the answer is not in the excerpts | ESCALATED |
| Model cites a source that does not exist | ESCALATED |
| A number (dose, age, lab value) is not in the cited source | ESCALATED |
| High-risk topic (pregnancy, children, kidney, liver, alcohol...) not in the cited source | ESCALATED |
| Less than 80% of statements cited | ESCALATED |
| Uncited sentence clearly supported by one excerpt | Citation added automatically |
| Follow-up like "what about side effects?" | Reuses the drug from earlier in the session |
| Unrelated question after a drug question | Does not reuse the drug |

## Evaluation

18 questions: 12 answerable, 6 that must be escalated (unknown drugs, off-topic, and pregnancy, which the sample labels do not cover).

| Metric | Result |
|---|---|
| Retrieval Hit@1 / Hit@4 / MRR | 100% / 100% / 1.0 |
| Answer correctness | 12/12 (100%) |
| Citation accuracy | 12/12 (100%) |
| Correct escalations | 6/6 (100%) |
| Unsafe answers | 0 |
| False escalations | 0 |
| Average response time | 3.9 s (local Llama 3.2 3B, CPU) |

These results are on 8 sample chunks with a small, self-written question set. They show the method and the safety layers work; they must be re-measured on real ingested labels with a larger question set.

## Known limitations

- Unknown-drug detection uses common generic-name endings; brand names (e.g. Tylenol) may not be caught.
- High-risk topic grounding uses a fixed topic and synonym list; new topics must be added to `HIGH_RISK_TOPICS` in `citation.py`.
- Thresholds are tuned on sample data and should be re-tuned on real labels.
- The local 3B model sometimes keeps medical terms in patient mode; a larger model improves style.
