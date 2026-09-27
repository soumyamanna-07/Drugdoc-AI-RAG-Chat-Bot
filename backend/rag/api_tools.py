"""External, non-LanceDB data tools used to augment grounded answers."""
from dataclasses import dataclass
from urllib.parse import quote

import requests

FAERS_ENDPOINT = "https://api.fda.gov/drug/event.json"


@dataclass
class FAERSResult:
    drug: str
    reactions: list[dict]
    total_reports: int | None
    url: str
    error: str | None = None


def fetch_faers_adverse_events(drug_name: str, timeout: float = 8.0) -> FAERSResult:
    """Fetch aggregated real-world FAERS reaction reports from openFDA.

    FAERS reports are spontaneous surveillance data, not incidence rates and
    not proof of causality. Callers must present them separately from labels.
    """
    drug = drug_name.strip()
    query = f'patient.drug.medicinalproduct:"{drug}"'
    encoded_query = quote(query, safe=':."')
    url = f"{FAERS_ENDPOINT}?search={encoded_query}&count=patient.reaction.reactionmeddrapt.exact"
    try:
        response = requests.get(
            FAERS_ENDPOINT,
            params={"search": query, "count": "patient.reaction.reactionmeddrapt.exact"},
            timeout=timeout,
        )
        response.raise_for_status()
        payload = response.json()
        reactions = [
            {"term": item.get("term", ""), "count": int(item.get("count", 0))}
            for item in payload.get("results", [])
            if item.get("term")
        ]
        # The count endpoint returns reaction-event occurrences, not unique FAERS
        # reports. Summing reactions would over-count reports containing multiple
        # adverse events, so keep this field unset rather than mislabeling it.
        return FAERSResult(drug=drug, reactions=reactions, total_reports=None, url=url)
    except (requests.RequestException, ValueError, TypeError) as exc:
        return FAERSResult(drug=drug, reactions=[], total_reports=None, url=url, error=str(exc))


def is_adverse_event_query(query: str) -> bool:
    lowered = query.lower()
    return any(term in lowered for term in (
        "side effect", "adverse", "reaction", "how common", "how often", "frequency",
        "incidence", "percentage", "percent", "rate", "nausea", "diarrhea",
    ))


def format_faers_context(result: FAERSResult) -> str:
    if result.error:
        return (
            f"[FAERS] openFDA FAERS lookup failed for {result.drug}; do not infer or invent "
            f"real-world counts. Source: {result.url}"
        )
    rows = "; ".join(f"{item['term']}: {item['count']} reports" for item in result.reactions[:20])
    return (
        f"[FAERS] Real-world spontaneous-report data for {result.drug}: {rows or 'no reactions returned'}. "
        "These are report counts, not incidence rates, clinical trial percentages, or proof of causality. "
        f"Source: {result.url}"
    )
