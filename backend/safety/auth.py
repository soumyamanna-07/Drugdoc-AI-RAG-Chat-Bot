"""Bearer-token authentication and role checks for protected API routes."""

from fastapi import Header, HTTPException

from backend.safety.auth_store import verify_token

_audit_logger = None


def set_audit_logger(logger) -> None:
    global _audit_logger
    _audit_logger = logger


def _bearer_user(authorization: str | None) -> dict | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return verify_token(authorization[7:].strip())


def require_admin_key(authorization: str | None = Header(default=None)) -> None:
    """Compatibility dependency name; authorization is bearer-token only."""
    user = _bearer_user(authorization)
    if user and user.get("role") == "admin":
        return
    raise HTTPException(status_code=403, detail="Administrator bearer token required.")


def require_user(authorization: str | None = Header(default=None)) -> dict:
    user = _bearer_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="A valid bearer token is required.")
    return user

