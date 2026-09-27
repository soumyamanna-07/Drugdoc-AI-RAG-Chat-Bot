from backend.rag.intent import classify


def test_frequency_routes_to_faers():
    decision = classify("How common is nausea with metformin?", session_id="no-history")
    assert decision.intent == "FAERS_FREQUENCY"
    assert decision.needs_faers
    assert decision.needs_vector_search


def test_history_only_requires_existing_context(monkeypatch):
    monkeypatch.setattr("backend.rag.intent._has_history", lambda _: True)
    decision = classify("What did you just say?", session_id="existing")
    assert decision.intent == "HISTORY_ONLY"
    assert not decision.needs_vector_search


def test_contextual_follow_up_routes_to_rag(monkeypatch):
    monkeypatch.setattr("backend.rag.intent._has_history", lambda _: True)
    decision = classify("What about pregnancy?", session_id="existing")
    assert decision.intent == "CONTEXTUAL_RAG"
    assert decision.needs_vector_search


def test_off_topic():
    decision = classify("What is the weather in Kolkata?", session_id="no-history")
    assert decision.intent == "OFF_TOPIC"
    assert not decision.needs_vector_search
