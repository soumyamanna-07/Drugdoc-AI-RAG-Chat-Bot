"""Calibrate the CURRENT LanceDB RAG stack without creating a second retriever.

Stages:
  1. Retrieval/routing sweeps over the real retriever + relevance gate.
  2. Optional full-pipeline evaluation through backend.rag.pipeline.answer().

Nothing is written to production config unless the user manually applies the
recommended values after reviewing the report.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import random
import statistics
import time
from collections import defaultdict
from pathlib import Path

from backend.rag import config
from backend.rag.intent import classify
from backend.rag.query_understanding import understand, remember_answer
from backend.rag.retriever import retrieve
from backend.rag.relevance_gate import check

ROOT = Path(__file__).resolve().parents[1]
QUESTIONS = Path(__file__).with_name("calibration_questions.csv")
REPORT = Path(__file__).with_name("calibration_report.json")


def load_questions() -> list[dict]:
    if not QUESTIONS.exists():
        raise SystemExit("Run `python -m calib.make_questions` first.")
    with QUESTIONS.open(encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def expected_tokens(row: dict) -> list[str]:
    return [x.strip().lower() for x in row.get("expected_keywords", "").split("|") if x.strip()]


def relevant(row, case: dict) -> bool:
    chunk = row.chunk
    drug = case.get("drug", "").strip().lower()
    if drug and drug not in (chunk.drug_name or "").lower():
        return False
    keys = expected_tokens(case)
    if keys:
        text = (chunk.text or "").lower()
        return any(k in text for k in keys)
    expected_chunk = case.get("expected_chunk", "").strip()
    return bool(expected_chunk and chunk.chunk_id == expected_chunk)


def retrieval_metrics(cases: list[dict], top_k: int, section_boost: float,
                      min_relevance: float, min_no_drug: float, min_support: float) -> dict:
    old = (config.TOP_K, config.MIN_RELEVANCE, config.MIN_RELEVANCE_NO_DRUG, config.MIN_SUPPORT)
    import backend.rag.retriever as retriever_module
    old_boost = retriever_module.SECTION_BOOST
    config.TOP_K = top_k
    config.MIN_RELEVANCE = min_relevance
    config.MIN_RELEVANCE_NO_DRUG = min_no_drug
    config.MIN_SUPPORT = min_support
    retriever_module.SECTION_BOOST = section_boost

    precisions, recalls, reciprocal_ranks, hits = [], [], [], []
    intent_total = intent_correct = faers_total = faers_correct = 0
    history_total = history_correct = 0
    gate_approved = gate_expected = 0

    try:
        for idx, case in enumerate(cases):
            session = f"calib-ret-{idx}-{top_k}-{section_boost}-{min_relevance}"
            # Seed context for the two routing cases that intentionally depend on history.
            if case.get("category") == "history_only":
                understand("Tell me about metformin.", mode=case.get("mode", "patient"), session_id=session)
                remember_answer(session, "Metformin is used with diet and exercise to improve glycemic control.")
            elif case.get("category") == "contextual_rag":
                understand("Tell me about metformin.", mode=case.get("mode", "patient"), session_id=session)
                remember_answer(session, "Metformin is used with diet and exercise to improve glycemic control.")
            decision = classify(case["question"], session_id=session, drug_hint=case.get("drug") or None)
            info = understand(case["question"], mode=case.get("mode", "patient"), session_id=session)
            expected_category = case.get("category", "")

            if expected_category in {"faers", "label_plus_faers"}:
                faers_total += 1
                faers_correct += int(decision.needs_faers)
            if expected_category == "history_only":
                history_total += 1
                history_correct += int(decision.intent == "HISTORY_ONLY" and not decision.needs_vector_search)

            if expected_category in {"faers", "label_plus_faers", "history_only", "contextual_rag", "off_topic", "injection"}:
                intent_total += 1
                expected_intent = {
                    "faers": "FAERS_FREQUENCY", "label_plus_faers": "FAERS_FREQUENCY",
                    "history_only": "HISTORY_ONLY", "contextual_rag": "CONTEXTUAL_RAG",
                    "off_topic": "OFF_TOPIC", "injection": "LABEL_RAG", # injection is safety-prechecked outside intent
                }[expected_category]
                intent_correct += int(decision.intent == expected_intent)

            retrieved = retrieve(info.standalone_query, info.drug_names, top_k=top_k,
                                 sections=info.section_hints, preferred_audience=info.mode)
            relevant_flags = [relevant(item, case) for item in retrieved]
            relevant_count = sum(relevant_flags)
            has_gold = bool(expected_tokens(case) or case.get("expected_chunk"))
            if has_gold:
                precisions.append(relevant_count / max(1, len(retrieved)))
                # Recall denominator is approximated from retrieved relevant evidence when no corpus-level gold IDs exist.
                recalls.append(1.0 if relevant_count else 0.0)
                if relevant_count:
                    first = relevant_flags.index(True) + 1
                    reciprocal_ranks.append(1 / first)
                    hits.append(1)
                else:
                    reciprocal_ranks.append(0.0)
                    hits.append(0)

            gate = check(info, retrieved)
            if case.get("expected"):
                gate_expected += 1
                expected_approved = case["expected"] == "APPROVED"
                gate_approved += int(gate.passed == expected_approved)
    finally:
        config.TOP_K, config.MIN_RELEVANCE, config.MIN_RELEVANCE_NO_DRUG, config.MIN_SUPPORT = old
        retriever_module.SECTION_BOOST = old_boost

    return {
        "precision_at_k": round(statistics.mean(precisions), 4) if precisions else None,
        "recall_at_k": round(statistics.mean(recalls), 4) if recalls else None,
        "hit_at_k": round(statistics.mean(hits), 4) if hits else None,
        "mrr": round(statistics.mean(reciprocal_ranks), 4) if reciprocal_ranks else None,
        "intent_accuracy": round(intent_correct / intent_total, 4) if intent_total else None,
        "faers_routing_accuracy": round(faers_correct / faers_total, 4) if faers_total else None,
        "history_only_accuracy": round(history_correct / history_total, 4) if history_total else None,
        "gate_expectation_accuracy": round(gate_approved / gate_expected, 4) if gate_expected else None,
        "evaluated_retrieval_cases": len(precisions),
    }


def sweep(cases: list[dict]) -> dict:
    current = {
        "top_k": config.TOP_K,
        "section_boost": __import__("backend.rag.retriever", fromlist=["SECTION_BOOST"]).SECTION_BOOST,
        "min_relevance": config.MIN_RELEVANCE,
        "min_relevance_no_drug": config.MIN_RELEVANCE_NO_DRUG,
        "min_support": config.MIN_SUPPORT,
    }
    top_ks = [2, 3, 4, 5, 6, 8]
    boosts = [0.0, 0.05, 0.10, 0.15, 0.20]
    thresholds = [round(x, 2) for x in [0.35, 0.40, 0.45, 0.50, 0.55, 0.60]]

    results = []
    for k in top_ks:
        for boost in boosts:
            metrics = retrieval_metrics(cases, k, boost, current["min_relevance"],
                                         current["min_relevance_no_drug"], current["min_support"])
            results.append({"top_k": k, "section_boost": boost, **metrics})

    best = max(results, key=lambda r: (
        -1 if r["precision_at_k"] is None else r["precision_at_k"],
        -1 if r["mrr"] is None else r["mrr"],
        -1 if r["intent_accuracy"] is None else r["intent_accuracy"],
    )) if results else None

    threshold_results = []
    for threshold in thresholds:
        metrics = retrieval_metrics(cases, current["top_k"], current["section_boost"], threshold,
                                     current["min_relevance_no_drug"], current["min_support"])
        threshold_results.append({"min_relevance": threshold, **metrics})

    best_threshold = max(threshold_results, key=lambda r: (
        -1 if r["precision_at_k"] is None else r["precision_at_k"],
        -1 if r["hit_at_k"] is None else r["hit_at_k"],
    )) if threshold_results else None

    return {
        "current": current,
        "best_top_k_section_boost": best,
        "best_min_relevance": best_threshold,
        "min_relevance_no_drug_sweep": [
            {"min_relevance_no_drug": t, **retrieval_metrics(cases, current["top_k"], current["section_boost"], current["min_relevance"], t, current["min_support"])}
            for t in thresholds
        ],
        "min_support_sweep": [
            {"min_support": t, **retrieval_metrics(cases, current["top_k"], current["section_boost"], current["min_relevance"], current["min_relevance_no_drug"], t)}
            for t in (0.20, 0.25, 0.30, 0.35, 0.40, 0.45)
        ],
        "top_k_section_sweep": results,
        "min_relevance_sweep": threshold_results,
    }


def keyword_correct(answer: str, case: dict) -> bool | None:
    keys = expected_tokens(case)
    if not keys:
        return None
    text = answer.lower()
    return any(key in text for key in keys)


def full_pipeline(cases: list[dict], sample_size: int) -> dict:
    from backend.rag.pipeline import answer

    eligible = cases[:]
    if sample_size and len(eligible) > sample_size:
        random.Random(42).shuffle(eligible)
        eligible = eligible[:sample_size]

    rows = []
    for idx, case in enumerate(eligible):
        session = f"calib-llm-{idx}"
        if case.get("category") in {"history_only", "contextual_rag"}:
            understand("Tell me about metformin.", mode=case.get("mode", "patient"), session_id=session)
            remember_answer(session, "Metformin is used with diet and exercise to improve glycemic control.")
        start = time.perf_counter()
        try:
            response = answer(case["question"], mode=case.get("mode", "patient"), session_id=session,
                              drug_hint=case.get("drug") or None)
            elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
            expected = case.get("expected", "APPROVED")
            status_ok = response.status == expected if expected else True
            content_ok = keyword_correct(response.answer, case)
            rows.append({
                "id": case["id"], "category": case["category"], "mode": case["mode"],
                "status": response.status, "expected": expected, "status_ok": status_ok,
                "keyword_correct": content_ok, "confidence": response.confidence,
                "confidence_bucket": response.confidence_bucket, "intent": response.intent,
                "retrieval_used": response.retrieval_used, "history_used": response.history_used,
                "faers_used": response.faers_used, "quality_metrics": response.quality_metrics.model_dump(),
                "citations": [c.chunk_id for c in response.citations], "seconds": elapsed_ms / 1000,
            })
        except Exception as exc:
            rows.append({"id": case["id"], "category": case["category"], "mode": case["mode"],
                         "error": repr(exc), "status_ok": False, "keyword_correct": False})

    answered = [r for r in rows if "error" not in r]
    approved = [r for r in answered if r.get("expected") == "APPROVED"]
    escalated = [r for r in answered if r.get("expected") == "ESCALATED"]
    false_escalations = sum(r.get("status") == "ESCALATED" for r in approved)
    unsafe = sum(r.get("status") == "APPROVED" for r in escalated)

    metric_values = defaultdict(list)
    for r in answered:
        for name, value in r.get("quality_metrics", {}).items():
            if name in {"retrieval_precision", "answer_correctness", "citation_accuracy"} and isinstance(value, (int, float)):
                metric_values[name].append(value)

    # ECE uses only cases for which the simple gold/keyword check provides a label.
    labeled = [r for r in approved if r.get("keyword_correct") is not None]
    bins = []
    for lo in [i / 10 for i in range(10)]:
        hi = lo + 0.1
        bucket = [r for r in labeled if lo <= r.get("confidence", 0) < hi or (hi == 1.0 and r.get("confidence", 0) == 1.0)]
        if bucket:
            acc = sum(bool(r.get("keyword_correct")) for r in bucket) / len(bucket)
            conf = statistics.mean(r.get("confidence", 0) for r in bucket)
            bins.append({"range": [lo, hi], "n": len(bucket), "accuracy": round(acc, 4), "confidence": round(conf, 4)})
    ece = sum((b["n"] / len(labeled)) * abs(b["accuracy"] - b["confidence"]) for b in bins) if labeled else None

    recommended_conf = None
    for threshold in [round(x, 2) for x in [0.50, 0.55, 0.60, 0.62, 0.65, 0.70, 0.75, 0.80, 0.84, 0.88, 0.90]]:
        accepted = [r for r in labeled if r.get("confidence", 0) >= threshold]
        if accepted and sum(bool(r.get("keyword_correct")) for r in accepted) / len(accepted) >= 0.95:
            recommended_conf = threshold
            break

    return {
        "sample_size": len(rows),
        "errors": sum("error" in r for r in rows),
        "status_accuracy": round(sum(r.get("status_ok", False) for r in answered) / len(answered), 4) if answered else None,
        "answer_keyword_accuracy": round(sum(bool(r.get("keyword_correct")) for r in approved) / len(approved), 4) if approved else None,
        "false_escalations": false_escalations,
        "unsafe_answers": unsafe,
        "avg_latency_seconds": round(statistics.mean(r["seconds"] for r in answered), 3) if answered else None,
        "live_metric_means": {k: round(statistics.mean(v), 4) for k, v in metric_values.items() if v},
        "confidence": {
            "ece": round(ece, 4) if ece is not None else None,
            "recommended_min_threshold_for_95pct_labeled_accuracy": recommended_conf,
            "bins": bins,
        },
        "rows": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--llm", type=int, default=0, help="Run full pipeline on N questions (0 = skip).")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    random.seed(args.seed)

    cases = load_questions()
    print(f"Loaded {len(cases)} calibration questions from {QUESTIONS}")

    report = {
        "version": "cts-current-lancedb-calibration-v1",
        "production_config_at_start": {
            "TOP_K": config.TOP_K,
            "MIN_RELEVANCE": config.MIN_RELEVANCE,
            "MIN_RELEVANCE_NO_DRUG": config.MIN_RELEVANCE_NO_DRUG,
            "MIN_SUPPORT": config.MIN_SUPPORT,
        },
        "retrieval_calibration": sweep(cases),
        "full_pipeline": None,
        "note": "Recommendations are diagnostic only. Production configuration is not modified by this script.",
    }

    if args.llm:
        print(f"Running full pipeline calibration on up to {args.llm} questions...")
        report["full_pipeline"] = full_pipeline(cases, args.llm)

    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Saved calibration report -> {REPORT}")
    print("Review the report before changing production thresholds.")


if __name__ == "__main__":
    main()
