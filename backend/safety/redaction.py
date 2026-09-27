"""PHI/PII redaction. Runs before an answer is cited/returned, and inside
every audit_log.log() call.

Previous behavior when the spaCy model failed to load: redact() silently
returned the original text unchanged ("fail open"). For a system whose PRD
states redaction is a core, non-optional requirement, failing open means the
one time it matters most (the model didn't install correctly) is exactly
the time it does nothing and nobody notices. This version fails closed:
get_analyzer() still tries once and caches the result, but redact() raises
RedactionUnavailable instead of passing text through when it's not
available. Callers (pipeline.py, audit_log.py) are expected to treat that as
"can't safely proceed" -- see pipeline.py for how a query-time failure
becomes an escalation instead of an unprotected answer.
"""
from functools import lru_cache

from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider
from presidio_anonymizer import AnonymizerEngine

TARGET_ENTITIES = [
    "PERSON", "PHONE_NUMBER", "EMAIL_ADDRESS",
    "MEDICAL_LICENSE", "US_SSN", "LOCATION", "CREDIT_CARD",
]

# en_core_web_sm (~12MB, pinned as a direct wheel in requirements.txt)
# instead of Presidio's default en_core_web_lg (~400MB, lazily downloaded on
# first use -- a multi-minute stall, or a hard failure offline).
_NLP_CONFIG = {
    "nlp_engine_name": "spacy",
    "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
}

_redaction_disabled_reason: str | None = None


class RedactionUnavailable(Exception):
    """Raised by redact() when the PII/PHI redactor isn't working. Callers
    must not fall back to returning unredacted text on this -- treat it as
    "cannot safely produce output right now", not "skip this step"."""


@lru_cache(maxsize=1)
def get_analyzer() -> AnalyzerEngine | None:
    global _redaction_disabled_reason
    try:
        provider = NlpEngineProvider(nlp_configuration=_NLP_CONFIG)
        analyzer = AnalyzerEngine(nlp_engine=provider.create_engine())
        # The built-in URL recognizer fetches a public-suffix list over the
        # network on first use. We don't redact URLs (not in
        # TARGET_ENTITIES), so drop it rather than depend on internet access.
        analyzer.registry.remove_recognizer("UrlRecognizer")
        return analyzer
    except Exception as e:
        _redaction_disabled_reason = f"{type(e).__name__}: {e}"
        print(f"[redaction] DISABLED — Presidio analyzer failed to initialize: {_redaction_disabled_reason}")
        return None


@lru_cache(maxsize=1)
def get_anonymizer() -> AnonymizerEngine:
    return AnonymizerEngine()


def redact(text: str) -> str:
    if not text:
        return text
    analyzer = get_analyzer()
    if analyzer is None:
        raise RedactionUnavailable(_redaction_disabled_reason or "redaction analyzer unavailable")
    results = analyzer.analyze(text=text, entities=TARGET_ENTITIES, language="en")
    return get_anonymizer().anonymize(text=text, analyzer_results=results).text


def redaction_status() -> dict:
    """So a health check, the startup log, or an admin endpoint can tell
    whether redaction is actually running."""
    get_analyzer()  # ensure the lru_cache has resolved one way or the other
    return {"active": _redaction_disabled_reason is None, "reason": _redaction_disabled_reason}
