"""Intent-routed RAG pipeline.

The orchestrator first decides whether a query needs conversation history,
label retrieval, FAERS, or an escalation. This prevents unnecessary vector
searches while keeping factual medication answers grounded in source material.
"""                                              # "intent-routed" is the mentor's point 2, added in this version
from concurrent.futures import ThreadPoolExecutor    # lets FAERS run in parallel with retrieval
import time                                      # perf_counter timings for the latency log

from backend.rag import config                   # thresholds live in config, never inline
from backend.rag.api_tools import fetch_faers_adverse_events, format_faers_context
                                                 # FAERS: FDA's post-market adverse-event report database
from backend.rag.citation import process as process_citations   # aliased so the call site reads clearly
from backend.rag.confidence import bucket_for, calibrated_score # raw score -> calibrated value + low/medium/high
from backend.rag.generator import NOT_IN_CONTEXT, generate
from backend.rag.intent import classify          # decides the route before any expensive work
from backend.rag.quality_metrics import estimate as estimate_metrics   # the mentor's 3 per-answer metrics
from backend.rag.query_understanding import (
    cache_response, get_cached_response, get_last_cached_response, get_history,
    remember_answer, understand,
)
from backend.rag.relevance_gate import check
from backend.rag.retriever import retrieve
from backend.rag.schemas import Citation, Mode, RAGResponse, QualityMetrics
from backend.safety import injection_guard       # prompt-injection detection
from backend.safety.redaction import RedactionUnavailable, redact   # Presidio PII removal

FALLBACK = {                                     # message when evidence is too weak (a real medical question)
    "clinician": "Insufficient reliable evidence in the uploaded labels to answer this confidently. The query has been flagged for human review.",
    "patient": "I couldn't find enough reliable information in the uploaded drug documents to answer this safely. Your question has been flagged for review. Please ask your doctor or pharmacist.",
}                                                # same event, different wording per audience
OUT_OF_SCOPE = {                                 # separate message for "not a drug question at all"
    "clinician": "This doesn't appear to be a question about the ingested drug documentation. I can only answer questions grounded in the uploaded labels.",
    "patient": "That doesn't look like a question about a medication. I can only help with questions about the drugs in the uploaded documents.",
}                                                # telling someone asking about the weather to "see a doctor" was wrong
INJECTION_QUERY_MESSAGE = "This request was blocked because it contains instructions that attempt to alter the assistant's operating rules. Please submit a medication question instead."
                                                 # the mentor's point 6: attacks get their own message, not the
                                                 # medical "consult a doctor" escalation
INJECTION_CORPUS_MESSAGE = "A retrieved source was blocked because it contained an embedded instruction. The source was not passed to the answer model."
                                                 # different case: the attack was hidden inside an uploaded document

# Reuse one worker instead of constructing a ThreadPoolExecutor for every
# FAERS request. This avoids per-request thread creation while preserving the
# existing parallel FAERS + retrieval behaviour.
_FAERS_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="faers")
                                                 # module-level, so it's created once for the whole process


def _response_from_cache(cached: dict, mode: Mode, intent) -> RAGResponse:
    metrics = QualityMetrics(**cached.get("quality_metrics", {}))   # rebuild the typed object from stored JSON
    return RAGResponse(
        mode=mode, answer=cached.get("answer", ""), citations=cached.get("citations", []),
        status="APPROVED", confidence=cached.get("confidence", 1.0),
        confidence_bucket=cached.get("confidence_bucket", "high"),
        intent=intent.intent, intent_confidence=intent.confidence,
        retrieval_used=False, history_used=True, faers_used=bool(cached.get("faers_used")),
                                                 # retrieval_used=False is honest: this answer came from cache
        quality_metrics=metrics,
    )


def _history_response(query: str, mode: Mode, session_id: str, intent) -> RAGResponse:
    cached = get_last_cached_response(session_id)
    if cached and cached.get("status") == "APPROVED":
        return _response_from_cache(cached, mode, intent)
                                                 # only reuse APPROVED answers: never re-serve an escalation
                                                 # as if it were a real answer
    history = get_history(session_id)
    last_ai = next((m for m in reversed(history.messages) if getattr(m, "type", "") == "ai"), None)
                                                 # newest AI message; next(..., None) returns None if there is none
    if last_ai:
        return RAGResponse(mode=mode, answer=last_ai.content, status="APPROVED",
                           confidence=0.7, confidence_bucket="medium", intent=intent.intent,
                           intent_confidence=intent.confidence, history_used=True,
                           quality_metrics=QualityMetrics(
                               retrieval_precision=None, answer_correctness=None,
                               citation_accuracy=None, estimated=True,
                                                 # None, not 0: nothing was retrieved, so the metrics don't apply
                               methodology="History-only response; no new source retrieval was performed.",
                           ))
    return RAGResponse(mode=mode, answer="There is not enough previous conversation context to answer that request yet.",
                       status="ESCALATED", reason="NO_HISTORY_CONTEXT", risk_level="none",
                       intent=intent.intent, intent_confidence=intent.confidence, history_used=True)


def _escalate(mode: Mode, reason: str, confidence: float, session_id: str,
              risk_level: str = "low", answer: str | None = None,
              intent=None, retrieval_used=False, history_used=False, faers_used=False,
              quality_metrics: QualityMetrics | None = None) -> RAGResponse:
                                                 # ONE place that builds every refusal, so messaging stays consistent
    if reason == "PROMPT_INJECTION":
        message = INJECTION_QUERY_MESSAGE        # attack -> blocked message
    elif reason == "CORPUS_INJECTION":
        message = INJECTION_CORPUS_MESSAGE       # poisoned document -> source-blocked message
    elif risk_level == "none":
        message = OUT_OF_SCOPE[mode]             # not a drug question -> out-of-scope message
    else:
        message = answer or FALLBACK[mode]       # genuine medical question, weak evidence -> safety fallback
    return RAGResponse(mode=mode, answer=message, status="ESCALATED",
                       confidence=round(calibrated_score(confidence), 2),
                       confidence_bucket=bucket_for(confidence), reason=reason,
                       risk_level=risk_level, intent=getattr(intent, "intent", None),
                       intent_confidence=getattr(intent, "confidence", None),
                                                 # getattr: intent may be None on very early escalations
                       retrieval_used=retrieval_used, history_used=history_used,
                       faers_used=faers_used,
                       quality_metrics=quality_metrics or QualityMetrics())


def answer(query: str, mode: Mode, session_id: str = "default", drug_hint: str | None = None) -> RAGResponse:
    started = time.perf_counter()                # perf_counter is monotonic: correct for measuring durations
    intent = classify(query, session_id=session_id, drug_hint=drug_hint)
    intent_ms = (time.perf_counter() - started) * 1000

    if injection_guard.looks_like_injection(query):
        return _escalate(mode, "PROMPT_INJECTION", 0.0, session_id, risk_level="high", intent=intent)
                                                 # FIRST real check: an attack never reaches retrieval or the LLM

    if intent.intent == "OFF_TOPIC":
        return _escalate(mode, "OFF_TOPIC", 0.0, session_id, risk_level="none", intent=intent)
                                                 # risk "none": nothing dangerous happened, so no review queue entry

    if intent.intent == "HISTORY_ONLY":
        return _history_response(query, mode, session_id, intent)
                                                 # "say that again" needs no vector search: the latency win

    cached = get_cached_response(session_id, query)
    if cached and cached.get("status") == "APPROVED":
        return _response_from_cache(cached, mode, intent)   # exact repeat in this session: instant answer

    understand_started = time.perf_counter()
    info = understand(query, mode=mode, session_id=session_id, drug_hint=drug_hint)
    understand_ms = (time.perf_counter() - understand_started) * 1000
    if intent.needs_faers:
        # "How often" is also a dosage phrase in ordinary label queries, but
        # once intent routing selects FAERS it should not bias retrieval toward
        # Dosage and Administration. Prefer adverse-reaction sections.
        info.section_hints = [s for s in info.section_hints if s != "Dosage and Administration"]
        if "Adverse Reactions" not in info.section_hints:
            info.section_hints.append("Adverse Reactions")
                                                 # fixes a real ambiguity: "how often" means dosing in one context
                                                 # and frequency of side effects in another

    faers_future = None
    if intent.needs_faers and info.drug_names:
        faers_future = _FAERS_EXECUTOR.submit(fetch_faers_adverse_events, info.drug_names[0])
                                                 # submit() starts the network call and returns immediately, so the
                                                 # FAERS API and the vector search run at the same time

    retrieval_started = time.perf_counter()
    retrieved = retrieve(info.standalone_query, info.drug_names,
                         sections=info.section_hints, preferred_audience=mode)
    retrieval_ms = (time.perf_counter() - retrieval_started) * 1000

    if any(injection_guard.looks_like_injection(r.chunk.text) for r in retrieved):
        return _escalate(mode, "CORPUS_INJECTION", 0.0, session_id, risk_level="high",
                         intent=intent, retrieval_used=True)
                                                 # second injection scan: an uploaded PDF could hide instructions

    gate = check(info, retrieved)                # the relevance gate: is there enough evidence?
    if not gate.passed:
        off_topic = not info.drug_names and (    # distinguishes "not a drug question" from "drug question,
            not retrieved or gate.reason.startswith("Weak evidence: no drug identified")
            or gate.reason == "No documents matched the question"
        )                                        # weak evidence", because they deserve different messages
        return _escalate(mode, gate.reason, gate.top_score, session_id,
                         risk_level="none" if off_topic else "low", intent=intent,
                         retrieval_used=True, history_used=intent.needs_history,
                         faers_used=faers_future is not None)

    faers_context = None
    faers_result = None
    if faers_future is not None:
        faers_result = faers_future.result()     # only NOW block on the FAERS call: it ran during retrieval
        faers_context = format_faers_context(faers_result)

    generation_started = time.perf_counter()
    gen = generate(info, gate.evidence, faers_context=faers_context)
                                                 # note gate.evidence, not retrieved: only chunks strong enough
                                                 # to count as evidence reach the model
    generation_ms = (time.perf_counter() - generation_started) * 1000
    if NOT_IN_CONTEXT in gen.text:
        return _escalate(mode, "ANSWER_NOT_GROUNDED", gate.top_score, session_id,
                         intent=intent, retrieval_used=True, history_used=intent.needs_history,
                         faers_used=faers_result is not None)
                                                 # the model itself says the answer isn't in the excerpts

    try:
        safe_text = redact(gen.text)             # strip any personal data before it's shown or logged
    except RedactionUnavailable as e:
        return _escalate(mode, f"REDACTION_UNAVAILABLE: {e}", 0.0, session_id,
                         risk_level="high", intent=intent, retrieval_used=True,
                         history_used=intent.needs_history, faers_used=faers_result is not None)
                                                 # FAIL CLOSED: if redaction is broken, refuse rather than risk
                                                 # emitting unredacted text

    faers_citation = None
    if faers_result is not None:
        faers_citation = Citation(chunk_id=f"faers:{faers_result.drug}", doc="openFDA FAERS",
                                  section="Adverse event reports", source="faers", url=faers_result.url)
                                                 # FAERS gets a real citation with its source URL

    cit = process_citations(safe_text, gate.evidence, question=query, external_citation=faers_citation)
    confidence = calibrated_score((gate.top_score + cit.coverage) / 2)
                                                 # confidence blends evidence strength with how well the answer
                                                 # is actually cited; calibration maps it to a realistic value
    metrics = estimate_metrics(retrieved, gate.evidence, cit)   # the mentor's 3 metrics, per answer

    if cit.invalid_refs:                         # ---- the safety checks, in order of severity ----
        return _escalate(mode, f"INVALID_CITATIONS: {cit.invalid_refs}", confidence, session_id,
                         intent=intent, retrieval_used=True, history_used=intent.needs_history,
                         faers_used=faers_result is not None, quality_metrics=metrics)
                                                 # cited a source that doesn't exist
    if cit.ungrounded_topics:
        return _escalate(mode, "UNGROUNDED_HIGH_RISK_TOPIC: " + ", ".join(cit.ungrounded_topics),
                         confidence, session_id, intent=intent, retrieval_used=True,
                         history_used=intent.needs_history, faers_used=faers_result is not None,
                         quality_metrics=metrics)
                                                 # the pregnancy-hallucination catch
    if cit.unsupported_numbers:
        return _escalate(mode, "UNSUPPORTED_NUMBERS: " + " | ".join(cit.unsupported_numbers),
                         confidence, session_id, intent=intent, retrieval_used=True,
                         history_used=intent.needs_history, faers_used=faers_result is not None,
                         quality_metrics=metrics)
                                                 # a dose or lab value not present in the cited source
    if not cit.citations:
        return _escalate(mode, "NO_CITATIONS", confidence, session_id, intent=intent,
                         retrieval_used=True, history_used=intent.needs_history,
                         faers_used=faers_result is not None, quality_metrics=metrics)
                                                 # an answer with no sources is never approved
    if cit.coverage < config.MIN_CITATION_COVERAGE:
        return _escalate(mode, f"LOW_CITATION_COVERAGE: {cit.coverage:.0%}", confidence, session_id,
                         intent=intent, retrieval_used=True, history_used=intent.needs_history,
                         faers_used=faers_result is not None, quality_metrics=metrics)
                                                 # too many uncited statements (threshold from config)

    total_ms = (time.perf_counter() - started) * 1000
    print(                                       # one timing line per approved answer: shows where time goes
        "[rag-timing] "
        f"intent_ms={intent_ms:.1f} understand_ms={understand_ms:.1f} "
        f"retrieval_ms={retrieval_ms:.1f} generation_ms={generation_ms:.1f} "
        f"total_ms={total_ms:.1f} faers={faers_result is not None}"
    )

    response = RAGResponse(mode=mode, answer=cit.text, citations=cit.citations,
                           status="APPROVED", confidence=round(confidence, 2),
                           confidence_bucket=bucket_for(confidence), intent=intent.intent,
                           intent_confidence=intent.confidence, retrieval_used=True,
                           history_used=intent.needs_history, faers_used=faers_result is not None,
                           quality_metrics=metrics)
                                                 # APPROVED is only reachable after every check above passed
    remember_answer(session_id, cit.text)        # the answer joins conversation memory for follow-ups
    cache_response(session_id, query, response.model_dump())   # cached so an exact repeat is instant
    return response


if __name__ == "__main__":
    print("DrugDoc AI intent-routed RAG console")   # the interactive console was replaced by the web 