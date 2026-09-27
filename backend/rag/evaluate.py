"""Evaluation: retrieval (Hit@1, Hit@K, MRR), answer correctness, citation accuracy,
and safety (unsafe answers, false escalations). Questions live in eval_set.json."""
import json
import time
from pathlib import Path

from backend.rag import config
from backend.rag.pipeline import answer
from backend.rag.query_understanding import understand
from backend.rag.retriever import retrieve

EVAL_FILE = Path(__file__).with_name("eval_set.json")
RESULTS_FILE = Path(__file__).with_name("eval_results.json")


def facts_ok(text: str, groups: list[list[str]]) -> bool:
    """Every group must be satisfied by at least one of its alternatives."""
    t = text.lower()
    return all(any(alt.lower() in t for alt in group) for group in groups)


def pct(part: int, whole: int) -> str:
    return f"{part}/{whole} ({part / whole:.0%})" if whole else "n/a"


def main() -> None:
    cases = json.loads(EVAL_FILE.read_text(encoding="utf-8-sig"))
    rows = []
    hit1 = hitk = n_ret = 0
    rr_sum = 0.0

    for i, c in enumerate(cases, start=1):
        mode = "clinician" if i % 2 == 0 else "patient"

        # 1) Retrieval quality (no LLM)
        rank = None
        if c.get("chunk"):
            info = understand(c["q"], mode=mode, session_id=f"ret-{i}")
            ids = [r.chunk.chunk_id for r in retrieve(info.standalone_query, info.drug_names,
                                                      sections=info.section_hints)]
            n_ret += 1
            if c["chunk"] in ids:
                rank = ids.index(c["chunk"]) + 1
                hitk += 1
                hit1 += rank == 1
                rr_sum += 1 / rank

        # 2) Full pipeline
        start = time.time()
        resp = answer(c["q"], mode=mode, session_id=f"eval-{i}")
        secs = round(time.time() - start, 1)

        correct = None
        if c["expect"] == "APPROVED":
            correct = resp.status == "APPROVED" and facts_ok(resp.answer, c.get("facts", []))
        cite_ok = None
        if resp.status == "APPROVED" and c.get("chunk"):
            cite_ok = c["chunk"] in [x.chunk_id for x in resp.citations]

        row = {"id": i, "question": c["q"], "mode": mode, "expected": c["expect"],
               "got": resp.status, "reason": resp.reason, "retrieval_rank": rank,
               "correct": correct, "cites_expected_chunk": cite_ok,
               "confidence": resp.confidence, "seconds": secs, "answer": resp.answer}
        rows.append(row)

        flag = "PASS" if resp.status == c["expect"] and correct is not False else "FAIL"
        print(f"[{i:02}] {flag}  expected={c['expect']:<9} got={resp.status:<9} {mode:<9} {c['q']}")
        print(f"      rank={rank}  correct={correct}  cites_expected={cite_ok}  "
              f"conf={resp.confidence}  {secs}s" + (f"  reason: {resp.reason}" if resp.reason else ""))

    answerable = [r for r in rows if r["expected"] == "APPROVED"]
    should_escalate = [r for r in rows if r["expected"] == "ESCALATED"]
    cited = [r for r in rows if r["cites_expected_chunk"] is not None]
    unsafe = [r for r in should_escalate if r["got"] == "APPROVED"]
    false_esc = [r for r in answerable if r["got"] == "ESCALATED"]

    summary = {
        "questions": len(rows),
        "retrieval_hit_at_1": pct(hit1, n_ret),
        f"retrieval_hit_at_{config.TOP_K}": pct(hitk, n_ret),
        "retrieval_mrr": round(rr_sum / n_ret, 3) if n_ret else None,
        "answer_correctness": pct(sum(bool(r["correct"]) for r in answerable), len(answerable)),
        "citation_accuracy": pct(sum(bool(r["cites_expected_chunk"]) for r in cited), len(cited)),
        "correct_escalations": pct(len(should_escalate) - len(unsafe), len(should_escalate)),
        "unsafe_answers": len(unsafe),
        "false_escalations": len(false_esc),
        "avg_seconds": round(sum(r["seconds"] for r in rows) / len(rows), 1),
    }

    print("\n" + "=" * 60 + "\n EVALUATION SUMMARY\n" + "=" * 60)
    for k, v in summary.items():
        print(f"  {k:<26} {v}")

    RESULTS_FILE.write_text(json.dumps({"summary": summary, "results": rows}, indent=2),
                            encoding="utf-8")
    print(f"\nSaved detailed results to {RESULTS_FILE.name}")


if __name__ == "__main__":
    main()
