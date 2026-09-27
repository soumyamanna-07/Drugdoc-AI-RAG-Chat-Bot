"""Per-response quality metrics.

The live metrics are explicitly marked as *estimated* because objective answer
correctness requires a gold/reference answer.  Offline evaluation remains the
source of truth for benchmark reporting; these values are useful for showing
quality signals next to an individual answer in the demo UI.
"""
from backend.rag import config
from backend.rag.citation import CitationResult
from backend.rag.schemas import RetrievedChunk, QualityMetrics


def _clamp(value: float) -> float:
    return round(max(0.0, min(1.0, value)), 2)


def estimate(retrieved: list[RetrievedChunk], evidence: list[RetrievedChunk], citation: CitationResult) -> QualityMetrics:
    if not retrieved:
        return QualityMetrics(retrieval_precision=0.0, answer_correctness=0.0, citation_accuracy=0.0)

    relevant = sum(1 for item in retrieved if item.score >= config.MIN_SUPPORT)
    retrieval_precision = relevant / len(retrieved)

    # Citation accuracy is structural: valid cited chunks + supported numbers +
    # high-risk topic grounding.  This is intentionally not presented as a
    # gold-standard factuality score.
    cited_total = len(citation.citations)
    invalid_penalty = 1.0 if citation.invalid_refs else 0.0
    number_penalty = 0.25 if citation.unsupported_numbers else 0.0
    topic_penalty = 0.25 if citation.ungrounded_topics else 0.0
    coverage = citation.coverage
    citation_accuracy = _clamp(coverage * (1.0 - invalid_penalty) - number_penalty - topic_penalty)

    evidence_strength = (sum(e.score for e in evidence) / len(evidence)) if evidence else 0.0
    answer_correctness = _clamp(0.45 * evidence_strength + 0.35 * coverage + 0.20 * citation_accuracy)

    return QualityMetrics(
        retrieval_precision=_clamp(retrieval_precision),
        answer_correctness=answer_correctness,
        citation_accuracy=citation_accuracy,
    )
