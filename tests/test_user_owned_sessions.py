import os
import tempfile
from pathlib import Path

import pytest


@pytest.fixture()
def session_db(tmp_path, monkeypatch):
    db = tmp_path / "sessions.sqlite3"
    monkeypatch.setenv("SESSION_DB_PATH", str(db))

    # Import after environment setup.
    from backend.rag import user_sessions

    return user_sessions


def test_user_a_creates_session_and_user_b_cannot_access(session_db):
    a = session_db.create_session("user-A", drug_name="metformin")

    assert session_db.owns_session("user-A", a["session_id"])
    assert not session_db.owns_session("user-B", a["session_id"])

    assert session_db.get_session("user-A", a["session_id"]) is not None
    assert session_db.get_session("user-B", a["session_id"]) is None


def test_listing_is_user_scoped(session_db):
    a = session_db.create_session("user-A", drug_name="metformin")
    b = session_db.create_session("user-B", drug_name="lisinopril")

    a_sessions = session_db.list_sessions("user-A")
    b_sessions = session_db.list_sessions("user-B")

    assert [x["session_id"] for x in a_sessions] == [a["session_id"]]
    assert [x["session_id"] for x in b_sessions] == [b["session_id"]]


def test_selected_drug_is_session_scoped(session_db):
    a = session_db.create_session("user-A", drug_name="metformin")
    b = session_db.create_session("user-B", drug_name="lisinopril")

    session_db.set_selected_drug("user-A", a["session_id"], "metformin")

    assert session_db.get_session("user-A", a["session_id"])["drug_name"] == "metformin"
    assert session_db.get_session("user-B", b["session_id"])["drug_name"] == "lisinopril"


def test_delete_clears_owned_session(session_db):
    a = session_db.create_session("user-A", drug_name="metformin")

    assert session_db.delete_session("user-A", a["session_id"]) is True
    assert session_db.get_session("user-A", a["session_id"]) is None
    assert session_db.owns_session("user-A", a["session_id"]) is False


def test_other_user_cannot_delete(session_db):
    a = session_db.create_session("user-A", drug_name="metformin")

    assert session_db.delete_session("user-B", a["session_id"]) is False
    assert session_db.get_session("user-A", a["session_id"]) is not None


def test_legacy_unowned_session_is_not_claimed(tmp_path, monkeypatch):
    db = tmp_path / "legacy.sqlite3"
    monkeypatch.setenv("SESSION_DB_PATH", str(db))

    from backend.rag import user_sessions

    # Simulate an old-style anonymous session without importing the optional
    # LangChain history layer; the ownership rule belongs to user_sessions.
    connection = user_sessions.connection()
    connection.execute(
        "INSERT INTO chat_sessions(session_id, last_used) VALUES (?, ?)",
        ("legacy-session", 1.0),
    )
    connection.commit()
    connection.close()

    assert not user_sessions.owns_session("user-A", "legacy-session")
    assert not user_sessions.owns_session("user-B", "legacy-session")
