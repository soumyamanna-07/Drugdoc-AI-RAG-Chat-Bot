"""Small, versioned drug-name normalization layer.

The curated aliases are deliberately local and deterministic. An external
resolver can be added later without changing callers of normalize_drug_name.
"""
import re

DRUG_ALIAS_VERSION = "2026-09-21"

BRAND_TO_GENERIC = {
    "tylenol": "paracetamol",
    "calpol": "paracetamol",
    "dolo": "paracetamol",
    "advil": "ibuprofen",
    "brufen": "ibuprofen",
    "nurofen": "ibuprofen",
    "amoxil": "amoxicillin",
    "moxatag": "amoxicillin",
    "glucophage": "metformin",
    "fortamet": "metformin",
    "lipitor": "atorvastatin",
    "torvast": "atorvastatin",
    "prilosec": "omeprazole",
    "losec": "omeprazole",
    "norvasc": "amlodipine",
    "amlip": "amlodipine",
    "zyrtec": "cetirizine",
    "reactine": "cetirizine",
    "nizoral": "ketoconazole",
    "fungoral": "ketoconazole",
}


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower().replace("-", " "))


def normalize_drug_name(value: str | None) -> str:
    normalized = _normalize(value or "")
    return BRAND_TO_GENERIC.get(normalized, normalized)


def aliases_for(generic_name: str) -> list[str]:
    canonical = normalize_drug_name(generic_name)
    return sorted(alias for alias, generic in BRAND_TO_GENERIC.items() if generic == canonical)
