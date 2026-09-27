from __future__ import annotations

from fastapi import Header, HTTPException

from backend.safety.auth_store import verify_token


def current_user(authorization: str | None = Header(default=None)) -> dict:
    """Resolve the authenticated identity from the existing bearer token.

    The browser/device is never used as the ownership key. All chat data is
    keyed by the stable authenticated user id carried by the signed token.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")

    token = authorization.split(" ", 1)[1].strip()
    user = verify_token(token)
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token.")
    return user
