"""Embedding benchmark POC for patient vs clinician retrieval.

Rebuilds an in-memory embedding matrix for each candidate model so vectors from
one model are never compared with another model's index. Relevance is derived
from the existing gold_standard_qa expected keywords.

Run from repository root:
  python -m backend.rag.embedding_benchmark
"""
import json
import time
from pathlib import Path

MODELS = {
    "all-MiniLM-L6-v2": "sentence-transformers/all-MiniLM-L6-v2",
    "BioLORD-2023-M": "FremyCompany/BioLORD-2023-M",
    "PubMedBERT": "NeuML/pubmedbert-base-embeddings",
}


def _norm(value: str) -> str:
    return " ".join(str(value).lower().split())


def _load_cases() -> list[dict]:
    path = Path(__file__).resolve().parents[1] / "app" / "tests" / "gold_standard_qa.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _load_corpus():
    from backend.rag.vector_store import get_table
    table = get_table()
    if table is None or table.count_rows() == 0:
        raise SystemExit("No LanceDB corpus found. Ingest the same corpus used by the demo first.")
    return table.to_arrow().to_pylist()


def _relevant(row: dict, case: dict) -> bool:
    text = _norm(row.get("text", ""))
    if case.get("drug") and case["drug"].lower() not in _norm(row.get("drug_name", "")):
        return False
    keywords = case.get("expected_keywords", [])
    return bool(keywords) and sum(1 for k in keywords if _norm(k) in text) >= 1


def main():
    from sentence_transformers import SentenceTransformer, util

    cases = _load_cases()
    corpus = _load_corpus()
    texts = [row.get("text", "") or " " for row in corpus]
    ids = [row.get("chunk_id", str(i)) for i, row in enumerate(corpus)]

    print("model\tsegment\tprecision@5\trecall@5\tmrr\tavg_query_latency_ms\tdimension")
    for label, model_name in MODELS.items():
        model = SentenceTransformer(model_name)
        doc_vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)
        totals = {k: [0.0, 0.0, 0.0, 0] for k in ("patient", "clinician", "all")}
        latencies = []
        for case in cases:
            segment = case.get("mode", "all")
            relevant_ids = {ids[i] for i, row in enumerate(corpus) if _relevant(row, case)}
            if not relevant_ids:
                continue
            start = time.perf_counter()
            qv = model.encode([case["query"]], normalize_embeddings=True)
            scores = util.cos_sim(qv, doc_vectors)[0].tolist()
            latencies.append((time.perf_counter() - start) * 1000)
            ranked = [ids[i] for i in sorted(range(len(ids)), key=lambda i: scores[i], reverse=True)[:5]]
            hits = sum(1 for x in ranked if x in relevant_ids)
            precision = hits / max(1, len(ranked))
            recall = hits / max(1, len(relevant_ids))
            rr = next((1 / (rank + 1) for rank, x in enumerate(ranked) if x in relevant_ids), 0.0)
            for bucket in (segment, "all"):
                totals[bucket][0] += precision
                totals[bucket][1] += recall
                totals[bucket][2] += rr
                totals[bucket][3] += 1
        avg_latency = sum(latencies) / len(latencies) if latencies else 0.0
        for segment, (p, r, mrr, n) in totals.items():
            if not n:
                continue
            print(f"{label}\t{segment}\t{p/n:.3f}\t{r/n:.3f}\t{mrr/n:.3f}\t{avg_latency:.1f}\t{model.get_sentence_embedding_dimension()}")


if __name__ == "__main__":
    main()
