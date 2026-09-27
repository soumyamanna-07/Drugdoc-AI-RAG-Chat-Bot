import pytest

from backend.safety import auth_store


def test_user_password_and_token_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(auth_store, "DB_PATH", tmp_path / "auth.sqlite3")
    monkeypatch.setenv("AUTH_SECRET", "test-secret")

    user = auth_store.create_user("user@example.com", "Test User", "password123")

    assert auth_store.authenticate("user@example.com", "password123")["id"] == user["id"]
    assert auth_store.authenticate("user@example.com", "wrong") is None
    token = auth_store.issue_token(user)
    assert auth_store.verify_token(token)["email"] == "user@example.com"


def test_duplicate_users_are_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(auth_store, "DB_PATH", tmp_path / "auth.sqlite3")
    auth_store.create_user("user@example.com", "Test User", "password123")

    with pytest.raises(ValueError, match="already exists"):
        auth_store.create_user("user@example.com", "Other User", "password123")
