"""Standalone gold-set evaluation for retrieval, answers, citations, and safety.

Run from the repository root:
    python -m backend.app.tests.evaluate_rag
    python -m backend.app.tests.evaluate_rag --judge

The default mode uses the live local RAG functions. ``--judge`` enables an
optional LLM-as-a-judge pass through Groq or Ollama; without it, correctness
uses a transparent keyword-overlap fallback.
"""
import argparse
import json
import os
from pathlib import Path
import re

from backend.rag.pipeline import answer
from backend.rag.query_understanding import understand
from backend.rag.retriever import retrieve
from backend.safety.injection_guard import looks_like_injection

DATASET = Path(__file__).with_name("gold_standard_qa.json")


def _load_cases() -> list[dict]:
    return json.loads(DATASET.read_text(encoding="utf-8"))


def _normalized(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def _retrieval_score(case: dict) -> tuple[float, list[str]]:
    info = understand(
        case["query"], mode=case["mode"], session_id=f"eval-{case['id']}",
        drug_hint=case.get("drug"),
    )
    retrieved = retrieve(info.standalone_query, info.drug_names, sections=info.section_hints)
    evidence = " ".join(item.chunk.text for item in retrieved)
    normalized = _normalized(evidence)
    keywords = case.get("expected_keywords", [])
    hits = [keyword for keyword in keywords if _normalized(keyword) in normalized]
    return (len(hits) / len(keywords) if keywords else 1.0), hits


def _judge_fallback(answer_text: str, case: dict) -> float:
    expected = case.get("expected_keywords", [])
    if not expected:
        return 1.0
    text = _normalized(answer_text)
    return sum(_normalized(keyword) in text for keyword in expected) / len(expected)


def _llm_judge(answer_text: str, case: dict) -> float | None:
    prompt = (
        "You are a strict medical RAG evaluator. Compare the generated answer to the gold answer "
        "using only factual agreement, not style. Return JSON only: {\"score\": 0.0}. Score from "
        "0 to 1. Gold answer:\n" + case["expected_answer"] + "\nGenerated answer:\n" + answer_text
    )
    try:
        if os.getenv("GROQ_API_KEY"):
            from groq import Groq
            response = Groq().chat.completions.create(
                model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                response_format={"type": "json_object"},
            )
            raw = response.choices[0].message.content
        else:
            import ollama
            response = ollama.chat(
                model=os.getenv("OLLAMA_MODEL", "llama3.2"),
                messages=[{"role": "user", "content": prompt}],
                format={"type": "object", "properties": {"score": {"type": "number"}}},
                options={"temperature": 0},
            )
            raw = response.message.content
        score = float(json.loads(raw)["score"])
        return max(0.0, min(1.0, score))
    except Exception as exc:
        print(f"judge unavailable ({type(exc).__name__}); using keyword fallback")
        return None


def evaluate(use_judge: bool = False) -> dict:
    cases = _load_cases()
    retrieval_scores = []
    correctness_scores = []
    citation_scores = []
    safety_results = []
    details = []

    for case in cases:
        expected_status = case.get("expected_status", 200)
        if expected_status == 400:
            actual_status = 400 if looks_like_injection(case["query"]) else 200
            safety_results.append(actual_status == expected_status)
            details.append({"id": case["id"], "status": actual_status, "safe": actual_status == expected_status})
            continue

        retrieval_precision, hits = _retrieval_score(case)
        result = answer(
            case["query"], mode=case["mode"], session_id=f"eval-answer-{case['id']}",
            drug_hint=case.get("drug"),
        )
        answer_score = _llm_judge(result.answer, case) if use_judge else None
        answer_score = _judge_fallback(result.answer, case) if answer_score is None else answer_score
        citation_score = 1.0 if result.citations and all(c.chunk_id for c in result.citations) else 0.0
        retrieval_scores.append(retrieval_precision)
        correctness_scores.append(answer_score)
        citation_scores.append(citation_score)
        details.append({
            "id": case["id"], "retrieval_precision": retrieval_precision,
            "retrieved_keywords": hits, "correctness": answer_score,
            "citation_accuracy": citation_score, "status": result.status,
        })

    def mean(values):
        return round(sum(values) / len(values), 3) if values else 0.0

    return {
        "cases": len(cases),
        "retrieval_precision": mean(retrieval_scores),
        "answer_correctness": mean(correctness_scores),
        "citation_accuracy": mean(citation_scores),
        "prompt_injection_resilience": mean([float(value) for value in safety_results]),
        "injection_cases": len(safety_results),
        "details": details,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--judge", action="store_true", help="Use Groq/Ollama as an answer judge.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON only.")
    args = parser.parse_args()
    report = evaluate(use_judge=args.judge)
    print(json.dumps(report, indent=None if args.json else 2))


if __name__ == "__main__":
    main()
