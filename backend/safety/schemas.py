"""Request/response contracts for the API layer. Reuses backend.rag.schemas
where it already fits instead of redefining Mode/Citation a second time."""
from typing import Literal, Optional

from pydantic import BaseModel, Field

from backend.rag.schemas import Mode, RAGResponse


class QueryRequest(BaseModel):
    session_id: str
    query: str = Field(..., min_length=2)
    mode: Mode
    drug_name: Optional[str] = None  # e.g. a frontend dropdown selection; only
    # used as a fallback when the query text itself names no drug — see
    # query_understanding.understand()'s drug_hint parameter.


class DrugProfileRequest(BaseModel):
    drug: str = Field(..., min_length=2, max_length=100)


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3)
    name: str = Field(..., min_length=1)
    password: str = Field(..., min_length=8)


class LoginRequest(BaseModel):
    email: str
    password: str


class DocumentUploadRequest(BaseModel):
    file_path: str


class ReviewResolution(BaseModel):
    """Body for POST /review/{request_id} — was three loose query params
    (`action` as free text, `notes` and `answer` as query strings), so any
    string at all became the review's new status and long text had to be
    URL-encoded into the query string. `action` is now a closed set."""
    action: Literal["APPROVE", "REJECT", "EDITED"]
    notes: str = ""
    answer: Optional[str] = None


class ChatbotResponse(RAGResponse):
    """RAGResponse plus a request_id, so the frontend can poll a pending review."""
    request_id: Optional[str] = None


class CreateSessionRequest(BaseModel):
    """Create a chat owned by the authenticated bearer-token user."""

    drug_name: Optional[str] = None
    title: Optional[str] = None


class ChatSessionSummary(BaseModel):
    session_id: str
    title: str
    drug_name: Optional[str] = None
    created_at: float
    updated_at: float
    message_count: int


class ChatSessionDetail(ChatSessionSummary):
    messages: list[dict]


class DeleteSessionResponse(BaseModel):
    session_id: str
    deleted: bool
