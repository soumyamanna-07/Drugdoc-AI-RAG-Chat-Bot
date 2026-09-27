from backend.rag import query_understanding


def test_context_status_and_rollover_persist_summary(tmp_path, monkeypatch):
    monkeypatch.setenv("SESSION_DB_PATH", str(tmp_path / "sessions.sqlite3"))

    history = query_understanding.get_history("source-session")
    history.add_user_message("What is metformin used for?")
    query_understanding._save_history("source-session", history)

    status = query_understanding.context_status("source-session")
    assert status["message_count"] == 1
    assert status["estimated_tokens"] > 0
    assert status["context_limit"] > status["response_reserve"]

    new_session = query_understanding.create_rollover_session(
        "source-session", "The user is asking about metformin indications."
    )
    assert new_session != "source-session"
    assert query_understanding.session_summary(new_session).startswith("The user")
