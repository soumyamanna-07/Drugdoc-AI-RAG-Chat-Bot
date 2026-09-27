from backend.rag import query_understanding


def test_chat_history_survives_module_cache_reset(tmp_path, monkeypatch):
    monkeypatch.setenv("SESSION_DB_PATH", str(tmp_path / "sessions.sqlite3"))
    monkeypatch.setattr(query_understanding, "known_drugs", lambda: [])
    query_understanding.understand("What is metformin?", mode="patient", session_id="session-1")

    second = query_understanding.get_history("session-1")
    assert len(second.messages) == 1
    assert second.messages[0].content == "What is metformin?"
    assert query_understanding.forget("session-1") is True
    assert query_understanding.get_history("session-1").messages == []
