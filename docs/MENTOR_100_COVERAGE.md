# Mentor 100-question coverage

The exact September 2026 mentor functional/stress-test suite is stored in:

`calib/mentor_100_questions.json`

`calib/make_questions.py` now imports this suite into the generated calibration set, so the mentor cases are not lost when a new calibration CSV is produced.

## Current implementation coverage

The backend contains explicit paths for:

- label-grounded retrieval with section-aware ranking and citation checks
- session-scoped follow-up resolution and persisted active-drug context
- FAERS frequency routing
- prompt-injection and corpus-injection blocking
- evidence-confidence/relevance gating and escalation
- patient/clinician response generation
- brand-source ingestion
- multimodal/image ingestion
- conversation cache and history persistence
- authenticated user-owned sessions
- cross-user session denial
- session deletion and cache deletion
- context status, summary, and rollover
- admin-protected ingestion/document/review/audit/dashboard operations

## What remains corpus-dependent

The repository snapshot intentionally does not contain the runtime LanceDB corpus or external FAERS responses. Therefore a local source-code review can establish that the 100 cases have implementation paths, but it cannot truthfully claim that every case returns the expected factual answer without running against the current ingested corpus and configured model/provider.

That final verification is the calibration/evaluation step. It should be run on the exact current DailyMed/brand corpus before the demo, using the mentor suite plus the existing gold/evaluation sets.

## Known expected limitations retained from the mentor plan

- Questions 91-92 are multi-intent and the router remains single-intent-per-turn.
- Questions 77-78 are deliberately terse pronoun/entity follow-ups and depend on persisted session context.
- Question 98 is now explicitly routed by `frequent/common complication` wording to the FAERS path.
- Exact quotation/numeric citation fidelity (55-58) still requires corpus/model evaluation; the safety/citation gates must not be relaxed to make these pass.
