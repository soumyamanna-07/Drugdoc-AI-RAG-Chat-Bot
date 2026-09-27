# Embedding POC

From the repository root after installing backend requirements and ingesting the same corpus used by the demo:

```bash
python -m backend.rag.embedding_benchmark
```

The benchmark compares the current general-purpose model with the two biomedical candidates suggested by the Cognizant mentor.

## Decision rule

Do not select a biomedical model solely because it is domain-specific. Prefer a model only if it provides a meaningful improvement in:

1. clinician Precision@5 / Recall@5 / MRR,
2. patient Precision@5 / Recall@5 / MRR,
3. citation-supporting retrieval quality,
4. acceptable query latency and memory footprint.

If the clinician model wins while MiniLM remains better/faster for patient queries, the next production experiment should be a dual-index/dual-vector-field architecture rather than silently changing the existing LanceDB vectors.
