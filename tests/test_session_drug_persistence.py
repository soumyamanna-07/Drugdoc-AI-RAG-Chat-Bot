import pytest


def test_active_drug_is_persisted_and_isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("SESSION_DB_PATH", str(tmp_path / "sessions.sqlite3"))
    from backend.rag import user_sessions

    metformin = user_sessions.create_session("user-A", drug_name="metformin")
    lisinopril = user_sessions.create_session("user-B", drug_name="lisinopril")

    assert user_sessions.get_selected_drug(metformin["session_id"]) == "metformin"
    assert user_sessions.get_selected_drug(lisinopril["session_id"]) == "lisinopril"

    user_sessions.set_selected_drug("user-A", metformin["session_id"], "metformin")
    assert user_sessions.get_selected_drug(metformin["session_id"]) == "metformin"
    assert user_sessions.get_selected_drug(lisinopril["session_id"]) == "lisinopril"


def test_other_user_cannot_change_selected_drug(tmp_path, monkeypatch):
    monkeypatch.setenv("SESSION_DB_PATH", str(tmp_path / "sessions.sqlite3"))
    from backend.rag import user_sessions

    session = user_sessions.create_session("user-A", drug_name="metformin")

    with pytest.raises(PermissionError):
        user_sessions.set_selected_drug("user-B", session["session_id"], "lisinopril")

    assert user_sessions.get_selected_drug(session["session_id"]) == "metformin"
