"""Two checks that run before an answer goes out. The category gate is a
placeholder list until Cognizant sends their own; the mode-consistency check
is Edge Case #1 from the mentor: a patient-mode user asking a clinician-level
question. Only that direction is treated as risk — a clinician asking a
simple question is fine either way."""
import re
from typing import Optional

HIGH_RISK_KEYWORDS = [
    "pediatric", "child", "infant", "mg/kg",
    "pregnan", "lactation", "breastfeed",
    "overdose", "toxicity", "interaction",
]

# Accidental-dosing-mistake phrasing that doesn't contain the literal word
# "overdose" but describes the same situation — e.g. the app's own suggested
# question "I accidentally took twice my prescribed dose" matched none of
# the keywords above and sailed straight past this gate.
_ACCIDENTAL_DOSE_PATTERNS = [
    re.compile(r"\baccidentally\s+(took|had|gave|administered)\b"),
    re.compile(r"\btook\b.{0,20}\b(twice|double|extra|two doses|2 doses)\b"),
    re.compile(r"\b(twice|double)\b.{0,15}\b(my|the|his|her|their)\s+dose\b"),
    re.compile(r"\btoo much\b.{0,15}\b(medicine|medication|dose|pills?|tablets?)\b"),
]


def is_high_risk_topic(query: str) -> bool:
    q = query.lower()
    if any(k in q for k in HIGH_RISK_KEYWORDS):
        return True
    return any(p.search(q) for p in _ACCIDENTAL_DOSE_PATTERNS)


def check_mode_consistency(query: str, mode: str) -> tuple[bool, Optional[str]]:
    """Returns (needs_review, reason)."""
    if mode == "patient" and is_high_risk_topic(query):
        return True, "patient mode asked a clinician-level or high-risk question"
    return False, None


if __name__ == "__main__":
    cases = [
        ("What is the mg/kg dosing for an infant?", "patient", True),
        ("What is the mg/kg dosing for an infant?", "clinician", False),
        ("What's the usual dose for an adult?", "patient", False),
    ]
    for q, mode, expected in cases:
        needs_review, reason = check_mode_consistency(q, mode)
        status = "PASS" if needs_review == expected else "FAIL"
        print(f"  {status}  ({mode}) {q!r} -> {needs_review} {reason or ''}")
