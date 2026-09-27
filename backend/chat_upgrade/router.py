from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .auth import current_user
from . import store

router = APIRouter(prefix="/api/chats", tags=["chat-history"])


class NewChatRequest(BaseModel):
    title: str = Field(default="New chat", max_length=160)
    topic: str | None = Field(default=None, max_length=200)


class RenameChatRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)


class AppendMessageRequest(BaseModel):
    role: str
    content: str = Field(..., min_length=1)
    metadata: dict = Field(default_factory=dict)


@router.post("")
def create_chat(body: NewChatRequest, user: dict = Depends(current_user)):
    return store.create_conversation(
        user_id=user["id"], title=body.title, topic=body.topic
    )


@router.get("")
def chats(limit: int = 50, offset: int = 0, user: dict = Depends(current_user)):
    return {
        "items": store.list_conversations(user["id"], limit=limit, offset=offset),
        "limit": limit,
        "offset": offset,
    }


@router.get("/{session_id}")
def chat(session_id: str, user: dict = Depends(current_user)):
    item = store.get_conversation(user["id"], session_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Chat not found.")
    item["messages"] = store.get_messages(user["id"], session_id)
    return item


@router.patch("/{session_id}")
def rename_chat(session_id: str, body: RenameChatRequest,
                user: dict = Depends(current_user)):
    if not store.rename_conversation(user["id"], session_id, body.title):
        raise HTTPException(status_code=404, detail="Chat not found.")
    return store.get_conversation(user["id"], session_id)


@router.post("/{session_id}/messages")
def append_chat_message(session_id: str, body: AppendMessageRequest,
                        user: dict = Depends(current_user)):
    ok = store.append_message(
        user_id=user["id"],
        session_id=session_id,
        role=body.role,
        content=body.content,
        metadata=body.metadata,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Chat not found.")
    return {"saved": True}


@router.delete("/{session_id}")
def delete_chat(session_id: str, user: dict = Depends(current_user)):
    if not store.delete_conversation(user["id"], session_id):
        raise HTTPException(status_code=404, detail="Chat not found.")
    return {"deleted": True, "session_id": session_id}
