# CTS backend upgrade pack

This is a drop-in backend infrastructure package for the current CTS
repository.

Included:

- authenticated, person/login-scoped conversation persistence
- previous-chat listing and reopening API
- new-chat API
- rename/delete API
- generic message persistence API
- rolling latency instrumentation
- integration patch for `backend/main.py`

This pack intentionally does not modify medication-answering, dosing,
interaction, escalation, or RAG-policy logic. Those parts should remain under
the project's existing safety and evaluation controls.

See `INTEGRATION.md` before applying the patch.
