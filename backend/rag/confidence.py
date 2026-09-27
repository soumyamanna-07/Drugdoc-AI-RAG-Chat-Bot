"""Confidence normalization and calibrated bucket policy.

The cutoffs are kept in configuration so they can be replaced by a fitted
reliability curve without changing the response contract. These v1 cutoffs
are conservative: approval confidence is only high after strong retrieval and
citation support, while weak evidence remains low.
"""
import os
from typing import Literal

ConfidenceBucket = Literal["low", "medium", "high"]
CALIBRATION_VERSION = "retrieval-citation-v1"
MEDIUM_CUTOFF = float(os.getenv("CONFIDENCE_MEDIUM_CUTOFF", "0.62"))
HIGH_CUTOFF = float(os.getenv("CONFIDENCE_HIGH_CUTOFF", "0.84"))


def calibrated_score(raw_score: float) -> float:
    return max(0.0, min(1.0, float(raw_score)))


def bucket_for(score: float) -> ConfidenceBucket:
    calibrated = calibrated_score(score)
    if calibrated >= HIGH_CUTOFF:
        return "high"
    if calibrated >= MEDIUM_CUTOFF:
        return "medium"
    return "low"
