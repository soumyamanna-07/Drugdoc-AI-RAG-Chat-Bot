"""Lightweight query intent classification and retrieval/tool routing.

This intentionally avoids an extra LLM call on every turn.  The classifier uses
high-signal lexical rules plus session context and returns an explicit routing
plan that the RAG pipeline can log, test, and replace with a learned classifier
later without changing the response contract.
"""
from dataclasses import dataclass
import re
from backend.rag import query_understanding


@dataclass(frozen=True)
class IntentDecision:
    intent: str
    needs_history: bool
    needs_vector_search: bool
    needs_faers: bool
    needs_generation: bool
    confidence: float
    reason: str


_HISTORY_ONLY_PATTERNS = [
    r"^(what did you (just )?say|what was your (last|previous) answer)",
    r"^(can you|could you) (repeat|restate|summari[sz]e) (that|your (last|previous) answer)",
    r"^(repeat|restate|summari[sz]e) (that|the above|your answer|it)$",
    r"^(why did you say that|what do you mean by that|what did you mean)$",
    r".*\b(again|once more|remind me)\b.*$",
]
_HISTORY_PATTERNS = [re.compile(p, re.I) for p in _HISTORY_ONLY_PATTERNS]

_FAERS_PATTERNS = [
    r"\bhow common\b", r"\bhow often\b", r"\bfrequency\b", r"\bfrequencies\b",
    r"\bincidence\b", r"\bincidence rate\b", r"\bpercentage\b", r"\bpercent\b",
    r"\brate of\b", r"\bhow many (reports|cases|people|patients)\b",
    r"\bfrequent (?:complication|side effect|reaction|adverse event)s?\b",
    r"\bcommon (?:complication|side effect|reaction|adverse event)s?\b",
    r"\breported (?:cases|events|reactions)\b", r"\bspontaneous reports?\b",
    r"\bfaers\b", r"\badverse event reports?\b",
]
_FAERS_RE = re.compile("|".join(_FAERS_PATTERNS), re.I)

_OFF_TOPIC_PATTERNS = [
    r"\bweather\b", r"\bfootball\b", r"\bcricket\b", r"\bmovie\b", r"\brecipe\b",
    r"\bstock price\b", r"\bpolitics\b", r"\btranslate\b", r"\bwrite (?:a|an) (?:email|poem|essay)\b",
]
_OFF_TOPIC_RE = re.compile("|".join(_OFF_TOPIC_PATTERNS), re.I)



def _has_history(session_id: str) -> bool:
    return bool(query_understanding.session_messages(session_id))


def classify(query: str, session_id: str = "default", drug_hint: str | None = None) -> IntentDecision:
    q = " ".join(query.strip().split())
    has_history = _has_history(session_id)

    if _OFF_TOPIC_RE.search(q) and not _FAERS_RE.search(q):
        return IntentDecision("OFF_TOPIC", has_history, False, False, False, 0.93,
                              "Strong off-topic lexical signal; no retrieval required.")

    if has_history and any(p.search(q) for p in _HISTORY_PATTERNS):
        return IntentDecision("HISTORY_ONLY", True, False, False, True, 0.97,
                              "The user explicitly asks about previous conversational content.")

    faers = bool(_FAERS_RE.search(q))
    if faers:
        return IntentDecision("FAERS_FREQUENCY", has_history, True, True, True, 0.92,
                              "The query asks for adverse-event frequency or spontaneous-report data.")

    # Follow-up questions containing references such as "it", "that", "this drug",
    # or "what about" need the prior drug/entity context but still need authoritative
    # retrieval because chat memory alone is not a source of truth.
    follow_up = bool(re.search(r"\b(it|that|this|these|those|what about|and what about)\b", q, re.I))
    if has_history and follow_up:
        return IntentDecision("CONTEXTUAL_RAG", True, True, False, True, 0.88,
                              "The query depends on prior context but asks for a new factual answer.")

    if drug_hint and q:
        return IntentDecision("LABEL_RAG", has_history, True, False, True, 0.90,
                              "A selected medication provides entity context for authoritative retrieval.")

    return IntentDecision("LABEL_RAG", has_history, True, False, True, 0.84,
                          "The query requests medication information and should be grounded in labels.")
