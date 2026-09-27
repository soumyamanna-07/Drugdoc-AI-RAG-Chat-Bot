"""Relevance gate: is there enough reliable evidence to answer?
Escalates instead of letting the LLM answer from weak or wrong-drug evidence."""
import difflib
import re

from pydantic import BaseModel, Field

from backend.rag import config
from backend.rag.query_understanding import known_drugs
from backend.rag.schemas import QueryInfo, RetrievedChunk

# Common generic drug-name endings: catches drugs that are NOT in the uploaded documents
_DRUG_SUFFIX = re.compile(
    r"\b[a-z]{2,}(?:cillin|mycin|cycline|oxacin|azole|profen|olol|pril|sartan|statin|"
    r"dipine|gliptin|gliflozin|formin|glitazone|tidine|triptan|setron|lukast|parin|"
    r"xaban|mab|amol|ovir|avir)\b"
)


class GateResult(BaseModel):
    passed: bool
    reason: str
    top_score: float = 0.0
    evidence: list[RetrievedChunk] = Field(default_factory=list)


def unknown_drug_terms(query: str, known: list[str]) -> list[str]:
    """Drug-like words in the query that are not in the knowledge base."""
    terms = []
    for word in set(_DRUG_SUFFIX.findall(query.lower())):
        if word in known or difflib.get_close_matches(word, known, n=1, cutoff=0.8):
            continue  # known drug (or a typo of one)
        terms.append(word)
    return sorted(terms)


def check(info: QueryInfo, retrieved: list[RetrievedChunk]) -> GateResult:
    unknown = unknown_drug_terms(info.original_query, known_drugs())
    if unknown:
        return GateResult(passed=False,
                          reason=f"Not in the uploaded documents: {', '.join(unknown)}")

    if not retrieved:
        return GateResult(passed=False, reason="No documents matched the question")

    top = max(r.score for r in retrieved)
    threshold = config.MIN_RELEVANCE if info.drug_names else config.MIN_RELEVANCE_NO_DRUG
    if top < threshold:
        why = "no drug identified and " if not info.drug_names else ""
        return GateResult(passed=False, top_score=top,
                          reason=f"Weak evidence: {why}best match {top:.2f} < {threshold:.2f}")

    evidence = [r for r in retrieved if r.score >= config.MIN_SUPPORT]
    return GateResult(passed=True, top_score=top, evidence=evidence,
                      reason=f"Enough evidence: best match {top:.2f} >= {threshold:.2f}")


if __name__ == "__main__":
    from backend.rag.query_understanding import understand
    from backend.rag.retriever import retrieve

    cases = [
        ("s1", "What is the maximum dose of metformin?"),
        ("s2", "What are the side effects of metformin?"),
        ("s3", "Tell me about amoxicillin"),
        ("s3", "What is the dose of ibuprofen?"),        # follow-up must NOT reuse amoxicillin
        ("s4", "Can I take metformin with atorvastatin?"),
        ("s5", "What is the weather in Kolkata today?"),
    ]
    for session, q in cases:
        info = understand(q, mode="patient", session_id=session)
        retrieved = retrieve(info.standalone_query, info.drug_names, sections=info.section_hints)
        g = check(info, retrieved)
        print(f"\n[{'PASS' if g.passed else 'ESCALATE'}] {q}")
        print(f"   drugs={info.drug_names}  reason: {g.reason}")
        if g.passed:
            print(f"   evidence: {[e.chunk.chunk_id for e in g.evidence]}")
