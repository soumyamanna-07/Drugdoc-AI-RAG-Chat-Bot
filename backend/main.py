"""Core API. See pipeline.py, ingest_jobs.py, audit_log.py, review_queue.py,
redaction.py, auth.py module docstrings for the reasoning behind each piece."""
import os
import json
import mimetypes
import secrets
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from backend.app.ingestion.export_to_rag_store import parse_url_and_chunk, store_chunks
from backend.app.ingestion.upload_dispatcher import SUPPORTED_SUFFIXES, parse_upload
from backend.analytics import (history, recent_activity, record_processed,
                               record_query, record_source_usage, record_upload)
from backend.ingest_jobs import create_job, get_job, update_job
from backend.paths import DATA_DIR
from backend.rag import query_understanding
from backend.rag import user_sessions
from backend.rag.context_summarizer import summarize_session
from backend.rag.drug_aliases import normalize_drug_name
from backend.rag.drug_profile import build_profile
from backend.rag.generator import GenerationError
from backend.rag.pipeline import answer as rag_answer
from backend.rag.vector_store import (delete_by_source_file, distinct_values,
                                      document_records, get_embedder, get_table)
from backend.safety import injection_guard, redaction
from backend.safety.audit_log import AuditLog
from backend.safety.auth import require_admin_key, require_user, set_audit_logger
from backend.safety.auth_store import (authenticate, consume_oauth_state,
                                       create_oauth_state, create_user,
                                       delete_user, initialize, issue_token, oauth_user)
from backend.safety.gate_router import check_mode_consistency
from backend.safety.rate_limit import RateLimitMiddleware
from backend.safety.review_queue import HumanReviewQueue
from backend.rag.schemas import ContextStatus, DrugProfile, SessionRollover
from backend.safety.schemas import (
    ChatbotResponse,
    DrugProfileRequest,
    LoginRequest,
    QueryRequest,
    RegisterRequest,
    ReviewResolution,
    CreateSessionRequest,
    ChatSessionSummary,
    ChatSessionDetail,
    DeleteSessionResponse,
)

app = FastAPI(title="DrugDocQA Core API", version="0.8")

app.add_middleware(RateLimitMiddleware)

cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.middleware("http")
async def prompt_injection_middleware(request: Request, call_next):
    """Reject direct prompt injection before query handlers can retrieve or generate."""
    if request.method == "POST" and request.url.path in {"/api/drug-profile"}:
        try:
            payload = json.loads(await request.body())
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = {}
        candidate = ""
        if isinstance(payload, dict):
            candidate = payload.get("query") or payload.get("drug") or ""
        if isinstance(candidate, str) and injection_guard.looks_like_injection(candidate):
            audit_log.log("INJECTION_BLOCKED", candidate[:200], ip=_client_ip(request), status="BLOCKED")
            return JSONResponse(status_code=400, content={"detail": injection_guard.INJECTION_ERROR})
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "Invalid request: " + "; ".join(errors)})


audit_log = AuditLog()
set_audit_logger(audit_log)
review_queue = HumanReviewQueue(audit_log)

UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = 50 * 1024 * 1024

_ingest_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="ingest")


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@app.on_event("startup")
def _warm_up_embedder():
    initialize()
    get_embedder()
    status = redaction.redaction_status()
    if not status["active"]:
        print(f"[startup] WARNING: PII/PHI redaction is disabled — {status['reason']}")


@app.post("/auth/register")
def register_user(body: RegisterRequest):
    if not os.getenv("AUTH_SECRET"):
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured. Set AUTH_SECRET in the backend .env file.",
        )
    try:
        user = create_user(body.email, body.name, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    try:
        token = issue_token(user)
    except RuntimeError as exc:
        delete_user(user["id"])
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"user": user, "token": token}


# ============================================================
# AUTHENTICATED USER-OWNED CHAT SESSIONS
# ============================================================

@app.post("/sessions", response_model=ChatSessionSummary)
def create_chat_session(
    body: CreateSessionRequest,
    user: dict = Depends(require_user),
):
    drug_name = None

    if body.drug_name:
        try:
            normalized = normalize_drug_name(body.drug_name)
        except Exception:
            normalized = ""

        if not normalized:
            raise HTTPException(status_code=400, detail="Invalid drug name.")

        try:
            known = query_understanding.known_drugs()
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail="Drug catalogue is temporarily unavailable.",
            ) from exc

        if normalized not in known:
            raise HTTPException(
                status_code=404,
                detail="Selected medicine is not available in the current drug catalogue.",
            )

        drug_name = normalized

    session = user_sessions.create_session(
        user_id=str(user["id"]),
        drug_name=drug_name,
        title=body.title,
    )

    return session


@app.get("/sessions", response_model=list[ChatSessionSummary])
def list_chat_sessions(
    user: dict = Depends(require_user),
):
    return user_sessions.list_sessions(str(user["id"]))


@app.get("/sessions/{session_id}", response_model=ChatSessionDetail)
def get_chat_session(
    session_id: str,
    user: dict = Depends(require_user),
):
    session = user_sessions.get_session(
        str(user["id"]),
        session_id,
    )

    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    return session


@app.delete("/sessions/{session_id}", response_model=DeleteSessionResponse)
def delete_chat_session(
    session_id: str,
    user: dict = Depends(require_user),
):
    deleted = user_sessions.delete_session(
        str(user["id"]),
        session_id,
    )

    if not deleted:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    return {
        "session_id": session_id,
        "deleted": True,
    }


@app.get("/session/{session_id}/context-status", response_model=ContextStatus)
def session_context_status(
    session_id: str,
    user: dict = Depends(require_user),
):
    try:
        user_sessions.require_owned_session(
            str(user["id"]),
            session_id,
        )
    except PermissionError:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    return query_understanding.context_status(session_id)


@app.post("/session/{session_id}/summarize")
def summarize_chat_session(
    session_id: str,
    user: dict = Depends(require_user),
):
    try:
        user_sessions.require_owned_session(
            str(user["id"]),
            session_id,
        )
    except PermissionError:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    try:
        summary = summarize_session(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GenerationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "session_id": session_id,
        "summary": summary,
        "estimated_tokens": query_understanding.estimate_tokens(summary),
    }


@app.post("/session/{session_id}/rollover", response_model=SessionRollover)
def rollover_chat_session(
    session_id: str,
    user: dict = Depends(require_user),
):
    try:
        user_sessions.require_owned_session(
            str(user["id"]),
            session_id,
        )
    except PermissionError:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    try:
        summary = summarize_session(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GenerationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    new_session_id = query_understanding.create_rollover_session(
        session_id,
        summary,
        user_id=str(user["id"]),
    )
    prompt = (
        "Continue our conversation using this retained context. Do not repeat the "
        "summary; answer my next question using it where relevant.\n\n"
        + summary
    )
    return SessionRollover(
        old_session_id=session_id,
        new_session_id=new_session_id,
        summary=summary,
        prompt_to_send=prompt,
        status="ROLLED_OVER",
    )


@app.post("/auth/login")
def login_user(body: LoginRequest):
    if not os.getenv("AUTH_SECRET"):
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured. Set AUTH_SECRET in the backend .env file.",
        )
    user = authenticate(body.email, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials.")
    return {"user": user, "token": issue_token(user), "expires_in": 3600}


@app.get("/auth/google/start")
def google_auth_start():
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
    if not client_id or not os.getenv("GOOGLE_CLIENT_SECRET"):
        raise HTTPException(status_code=503, detail="Google sign-in is not configured on this server.")
    state = secrets.token_urlsafe(32)
    create_oauth_state(state)
    params = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    })
    return {"authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?" + params}


@app.get("/auth/google/callback")
def google_auth_callback(code: str | None = None, state: str | None = None,
                         error: str | None = None):
    frontend = os.getenv("OAUTH_FRONTEND_REDIRECT", "http://localhost:5173/login")
    if error or not code or not state or not consume_oauth_state(state):
        return RedirectResponse(frontend + "?oauth_error=Google+sign-in+was+cancelled+or+expired")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
    token_body = urllib.parse.urlencode({
        "code": code, "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "redirect_uri": redirect_uri, "grant_type": "authorization_code",
    }).encode()
    token_request = urllib.request.Request("https://oauth2.googleapis.com/token", data=token_body, method="POST")
    try:
        token_data = __import__("json").loads(urllib.request.urlopen(token_request, timeout=10).read())
        profile_request = urllib.request.Request(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        profile = __import__("json").loads(urllib.request.urlopen(profile_request, timeout=10).read())
        user = oauth_user("google", profile["sub"], profile["email"], profile.get("name", "Google user"))
        query = urllib.parse.urlencode({"oauth_token": issue_token(user)})
        return RedirectResponse(frontend + "?" + query)
    except (KeyError, OSError, ValueError, __import__("json").JSONDecodeError):
        return RedirectResponse(frontend + "?oauth_error=Google+sign-in+failed")


def _escalate(query: str, mode: str, reason: str, risk_level: str, ip: str | None,
              user_id: str | None = None, session_id: str | None = None,
              answer: str = "") -> ChatbotResponse:
    if risk_level == "none" or reason in {"PROMPT_INJECTION", "CORPUS_INJECTION"} or reason.startswith("PROMPT_INJECTION"):
        # Off-topic and prompt-injection blocks are not medical review cases.
        return ChatbotResponse(mode=mode, answer=answer, status="ESCALATED",
                               reason=reason, risk_level=risk_level, request_id=None)
    
    # Securely bind the escalation record to the authenticated user and their active session
    result = review_queue.flag(query, mode, reason, user_id=user_id, session_id=session_id)
    return ChatbotResponse(mode=mode, answer=answer, status="ESCALATED",
                           reason=reason, risk_level=risk_level, request_id=result["request_id"])


@app.post("/query", response_model=ChatbotResponse)
def process_query(
    req: QueryRequest,
    request: Request,
    user: dict = Depends(require_user),
):
    import time

    request_started = time.perf_counter()

    # user_id comes ONLY from the verified bearer token.
    authenticated_user_id = str(user["id"])

    try:
        user_sessions.require_owned_session(
            authenticated_user_id,
            req.session_id,
        )
    except PermissionError:
        # Deliberately use 404 instead of 403 so attackers cannot probe
        # whether a session_id exists for another account.
        raise HTTPException(status_code=404, detail="Chat session not found.")

    user_sessions.touch(
        authenticated_user_id,
        req.session_id,
    )

    ip = _client_ip(request)

    if injection_guard.looks_like_injection(req.query):
        audit_log.log("INJECTION_BLOCKED", req.query[:200], ip=ip, status="BLOCKED")
        record_query("ESCALATED")
        # Injection is a policy block, not a medical escalation.
        return ChatbotResponse(
            mode=req.mode,
            answer="This request was blocked because it contains instructions that attempt to alter the assistant's operating rules. Please submit a medication question instead.",
            status="ESCALATED",
            reason="PROMPT_INJECTION",
            risk_level="high",
            confidence=0.0,
            confidence_bucket="low",
            intent="PROMPT_INJECTION",
            intent_confidence=1.0,
            retrieval_used=False,
            history_used=False,
            faers_used=False,
            request_id=None,
        )

    needs_review, reason = check_mode_consistency(req.query, req.mode)
    if needs_review:
        record_query("ESCALATED")
        return _escalate(req.query, req.mode, reason, risk_level="high", ip=ip,
                         user_id=authenticated_user_id, session_id=req.session_id)

    conversational = {
        "hi": "Hello! How can I help you with your medication question?",
        "hello": "Hello! How can I help you with your medication question?",
        "good morning": "Good morning! How can I help you with your medication question?",
        "good afternoon": "Good afternoon! How can I help you with your medication question?",
        "good evening": "Good evening! How can I help you with your medication question?",
        "thanks": "You're welcome!",
        "thank you": "You're welcome!",
        "bye": "Goodbye! Take care.",
    }

    conversational_key = " ".join(req.query.strip().lower().split())

    if conversational_key in conversational:
        answer_text = conversational[conversational_key]

        history = query_understanding.get_history(req.session_id)
        from langchain_core.messages import HumanMessage, AIMessage

        history.add_message(
            HumanMessage(
                content=req.query,
                additional_kwargs={},
            )
        )
        history.add_message(AIMessage(content=answer_text))
        query_understanding._save_history(req.session_id, history)

        elapsed_ms = round((time.perf_counter() - request_started) * 1000, 2)
        print(f"[latency] total_ms={elapsed_ms} auth_session_ms=excluded rag=false faers=false llm=false conversational=true")
        record_query("ANSWERED")

        return ChatbotResponse(
            mode=req.mode, answer=answer_text, status="ANSWERED",
            confidence=1.0, confidence_bucket="high", reason="CONVERSATIONAL",
            risk_level="none", request_id=None, intent="CONVERSATIONAL",
            intent_confidence=1.0, retrieval_used=False, history_used=False, faers_used=False,
        )

    try:
        result = rag_answer(
            req.query,
            mode=req.mode,
            session_id=req.session_id,
            drug_hint=req.drug_name,
        )
    except GenerationError as e:
        audit_log.log("GENERATION_FAILED", f"session={req.session_id}: {e}", ip=ip, status="FAILED")
        raise HTTPException(status_code=503, detail="The answer generator is unavailable right now.")

    if result.status == "ESCALATED":
        record_query(result.status)
        return ChatbotResponse(
            mode=req.mode, answer=result.answer, citations=result.citations, status=result.status,
            confidence=result.confidence, confidence_bucket=result.confidence_bucket,
            reason=result.reason, risk_level=result.risk_level, request_id=None,
            intent=result.intent, intent_confidence=result.intent_confidence,
            retrieval_used=result.retrieval_used, history_used=result.history_used,
            faers_used=result.faers_used, quality_metrics=result.quality_metrics,
        )

    elapsed_ms = round((time.perf_counter() - request_started) * 1000, 2)
    print(f"[latency] total_ms={elapsed_ms} retrieval_used={result.retrieval_used} faers_used={result.faers_used} history_used={result.history_used} llm=true")

    audit_log.log("QUERY_ANSWERED", f"session={req.session_id}", ip=ip, status="SUCCESS")
    record_query(result.status)
    return ChatbotResponse(mode=req.mode, answer=result.answer, citations=result.citations,
                           status=result.status, confidence=result.confidence,
                           confidence_bucket=result.confidence_bucket,
                           reason=result.reason, risk_level=result.risk_level,
                           request_id=None, intent=result.intent,
                           intent_confidence=result.intent_confidence,
                           retrieval_used=result.retrieval_used, history_used=result.history_used,
                           faers_used=result.faers_used, quality_metrics=result.quality_metrics)


@app.post("/api/drug-profile", response_model=DrugProfile)
def drug_profile(body: DrugProfileRequest, request: Request):
    if injection_guard.looks_like_injection(body.drug):
        audit_log.log("INJECTION_BLOCKED", body.drug[:200], ip=_client_ip(request), status="BLOCKED")
        raise HTTPException(status_code=400, detail=injection_guard.INJECTION_ERROR)
    try:
        return build_profile(body.drug)
    except ValueError as exc:
        audit_log.log("INJECTION_BLOCKED", body.drug[:200], ip=_client_ip(request), status="BLOCKED")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except GenerationError as exc:
        audit_log.log("PROFILE_GENERATION_FAILED", body.drug[:200], ip=_client_ip(request), status="FAILED")
        raise HTTPException(status_code=503, detail="The structured profile generator is unavailable right now.") from exc


def _run_ingestion(job_id: str, stored_path: Path, drug_name: str, doc_id: str | None,
                   original_filename: str) -> None:
    try:
        update_job(job_id, stage="PARSING", detail="Parsing and chunking the document.")
        chunks = parse_upload(str(stored_path), doc_id=doc_id, drug_name=drug_name,
                              original_filename=original_filename)
        update_job(job_id, chunks_found=len(chunks))

        if len(chunks) == 0:
            detail = "No extractable text — parsing and OCR both produced nothing usable."
            audit_log.log("INGESTION_FAILED", f"file={original_filename}: {detail}",
                          resource=f"document:{original_filename}", status="FAILED")
            update_job(job_id, stage="FAILED", detail=detail, error=detail)
            stored_path.unlink(missing_ok=True)
            return

        update_job(job_id, stage="SCANNING", detail="Scanning chunks for hidden instructions.")
        flagged = [c for c in chunks if injection_guard.looks_like_injection(c.text)]
        if flagged:
            detail = f"{len(flagged)} of {len(chunks)} section(s) failed a safety check."
            audit_log.log("INGESTION_REJECTED", f"file={original_filename}: {detail}",
                          resource=f"document:{original_filename}", status="REJECTED")
            update_job(job_id, stage="REJECTED", detail=detail, error=detail)
            stored_path.unlink(missing_ok=True)
            return

        update_job(job_id, stage="EMBEDDING", detail="Embedding chunks and writing to the vector store.")
        n = store_chunks(chunks)
        record_processed()
        record_source_usage(chunks[0].source_type or "unknown")
        query_understanding.invalidate_known_drugs_cache()

        audit_log.log("INGESTION_ACCEPTED", f"file={original_filename}: {n} chunks stored",
                      resource=f"document:{original_filename}", status="SUCCESS")
        update_job(job_id, stage="STORED", detail=f"Stored {n} chunk(s).", chunks_stored=n)
    except Exception as e:
        audit_log.log("INGESTION_FAILED", f"file={original_filename}: {e}",
                      resource=f"document:{original_filename}", status="FAILED")
        update_job(job_id, stage="FAILED", detail="Ingestion failed.", error=str(e))
        stored_path.unlink(missing_ok=True)


def _run_brand_ingestion(job_id: str, url: str, drug_name: str, doc_id: str | None) -> None:
    try:
        update_job(job_id, stage="PARSING", detail="Fetching and parsing the brand source.")
        chunks = parse_url_and_chunk(url, doc_id=doc_id, drug_name=drug_name)
        update_job(job_id, chunks_found=len(chunks))
        if not chunks:
            raise ValueError("The brand source contained no extractable text.")
        update_job(job_id, stage="SCANNING", detail="Scanning brand-source chunks for hidden instructions.")
        if any(injection_guard.looks_like_injection(chunk.text) for chunk in chunks):
            raise ValueError("Brand source contains an embedded instruction and was rejected.")
        update_job(job_id, stage="EMBEDDING", detail="Embedding brand-source chunks.")
        count = store_chunks(chunks)
        record_processed()
        record_source_usage(chunks[0].source_type or "brand_site")
        query_understanding.invalidate_known_drugs_cache()
        audit_log.log("INGESTION_ACCEPTED", f"brand source={url}: {count} chunks stored",
                      resource=f"document:{url}", status="SUCCESS")
        update_job(job_id, stage="STORED", detail=f"Stored {count} chunk(s).", chunks_stored=count)
    except Exception as exc:
        audit_log.log("INGESTION_FAILED", f"brand source={url}: {exc}",
                      resource=f"document:{url}", status="FAILED")
        update_job(job_id, stage="FAILED", detail="Brand-source ingestion failed.", error=str(exc))


@app.get("/admin/auth/check", dependencies=[Depends(require_admin_key)])
def admin_auth_check(request: Request):
    audit_log.log("ADMIN_AUTH_SUCCESS", "Admin authentication succeeded",
                  ip=_client_ip(request), status="SUCCESS")
    return {"authenticated": True}


@app.post("/ingest", dependencies=[Depends(require_admin_key)])
async def ingest_document(file: UploadFile, drug_name: str, request: Request, doc_id: str | None = None):
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds the {MAX_UPLOAD_BYTES // (1024*1024)} MB limit.")

    safe_filename = os.path.basename(file.filename or "upload")
    suffix = Path(safe_filename).suffix.lower()
    if suffix != ".zip" and suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(status_code=415, detail="Unsupported upload type.")
    clean_drug_name = normalize_drug_name(drug_name)

    job = create_job(filename=file.filename, drug_name=clean_drug_name, doc_id=doc_id)
    record_upload()
    stored_path = UPLOAD_DIR / f"{job['job_id'][:8]}_{safe_filename}"
    stored_path.write_bytes(content)

    audit_log.log(
        "DOCUMENT_UPLOAD_REQUESTED",
        f"file={safe_filename}: upload request queued (drug={clean_drug_name})",
        ip=_client_ip(request),
        resource=f"document:{safe_filename}",
        status="QUEUED",
    )

    _ingest_executor.submit(_run_ingestion, job["job_id"], stored_path, clean_drug_name, doc_id, safe_filename)
    return {"job_id": job["job_id"], "status": "QUEUED"}


@app.post("/ingest-url", dependencies=[Depends(require_admin_key)])
def ingest_url(url: str, drug_name: str, request: Request, doc_id: str | None = None):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=422, detail="url must be an absolute HTTP(S) URL")
    clean_drug_name = normalize_drug_name(drug_name)
    job = create_job(filename=url, drug_name=clean_drug_name, doc_id=doc_id)
    record_upload()
    audit_log.log("BRAND_SOURCE_REQUESTED", f"url={url} (drug={clean_drug_name})",
                  ip=_client_ip(request), resource=f"document:{url}", status="QUEUED")
    _ingest_executor.submit(_run_brand_ingestion, job["job_id"], url, clean_drug_name, doc_id)
    return {"job_id": job["job_id"], "status": "QUEUED", "source": "brand_site"}


@app.get("/ingest/{job_id}/status", dependencies=[Depends(require_admin_key)])
def ingest_status(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job id")
    return job


@app.get("/documents/{filename}/download", dependencies=[Depends(require_admin_key)])
def download_document(filename: str, request: Request):
    safe_filename = os.path.basename(filename)
    file_path = (UPLOAD_DIR / safe_filename).resolve()

    if not str(file_path).startswith(str(UPLOAD_DIR.resolve()) + os.sep):
        audit_log.log(
            "UNAUTHORIZED_FILE_ACCESS",
            f"attempted_file={safe_filename}",
            status="BLOCKED",
            ip=_client_ip(request),
        )
        raise HTTPException(status_code=403, detail="Access denied.")

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found.")

    audit_log.log(
        "DOCUMENT_DOWNLOADED",
        f"filename={safe_filename}",
        ip=_client_ip(request),
        resource=f"document:{safe_filename}",
        status="SUCCESS",
    )

    return FileResponse(
        path=file_path,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}"'
        },
    )
    

@app.get("/documents/{filename}/view", dependencies=[Depends(require_admin_key)])
def view_document(filename: str, request: Request, download: bool = False):
    safe_filename = os.path.basename(filename)
    file_path = (UPLOAD_DIR / safe_filename).resolve()
    if not str(file_path).startswith(str(UPLOAD_DIR.resolve()) + os.sep):
        audit_log.log(
            "UNAUTHORIZED_FILE_ACCESS",
            f"attempted_file={safe_filename}",
            ip=_client_ip(request),
            status="BLOCKED",
        )
        raise HTTPException(status_code=403, detail="Access denied.")
    if not file_path.is_file():
        candidates = list(UPLOAD_DIR.glob(f"*_{safe_filename}"))
        if candidates and candidates[0].is_file():
            file_path = candidates[0]
        else:
            raise HTTPException(status_code=404, detail="Document not found.")

    media_type, _ = mimetypes.guess_type(str(file_path))
    if not media_type:
        media_type = "application/octet-stream"

    disposition = "attachment" if download else "inline"
    action = "DOCUMENT_DOWNLOADED" if download else "DOCUMENT_VIEWED"

    audit_log.log(
        action,
        f"filename={safe_filename}",
        ip=_client_ip(request),
        resource=f"document:{safe_filename}",
        status="SUCCESS",
    )
    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={"Content-Disposition": f'{disposition}; filename="{safe_filename}"'},
    )


@app.get("/documents/user-view/{filename}", response_class=FileResponse)
def view_document_for_user(
    filename: str,
    request: Request,
    user: dict = Depends(require_user),
):
    """Serve an ingested source document to an authenticated user.

    The main document view/download route remains admin-only. This dedicated
    route exists so citation links shown in the normal user experience can
    open the same uploaded evidence without exposing the admin dependency.
    """

    safe_filename = os.path.basename(filename)
    file_path = (UPLOAD_DIR / safe_filename).resolve()

    if not str(file_path).startswith(str(UPLOAD_DIR.resolve()) + os.sep):
        audit_log.log(
            "UNAUTHORIZED_FILE_ACCESS",
            f"attempted_file={safe_filename}",
            ip=_client_ip(request),
            status="BLOCKED",
        )
        raise HTTPException(status_code=403, detail="Access denied.")

    if not file_path.is_file():
        candidates = list(UPLOAD_DIR.glob(f"*_{safe_filename}"))
        if candidates and candidates[0].is_file():
            file_path = candidates[0]
        else:
            raise HTTPException(status_code=404, detail="Document not found.")

    media_type, _ = mimetypes.guess_type(str(file_path))
    if not media_type:
        media_type = "application/octet-stream"

    audit_log.log(
        "DOCUMENT_VIEWED",
        f"filename={safe_filename}",
        ip=_client_ip(request),
        resource=f"document:{safe_filename}",
        status="SUCCESS",
    )

    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{safe_filename}"'},
    )


@app.delete("/documents/{filename}", dependencies=[Depends(require_admin_key)])
def delete_document(filename: str, request: Request):
    safe_filename = os.path.basename(filename)
    file_path = (UPLOAD_DIR / safe_filename).resolve()
    if not str(file_path).startswith(str(UPLOAD_DIR.resolve()) + os.sep):
        raise HTTPException(status_code=403, detail="Access denied.")

    removed_chunks = delete_by_source_file(safe_filename)
    file_existed = file_path.is_file()
    file_path.unlink(missing_ok=True)
    if not file_existed and removed_chunks == 0:
        raise HTTPException(status_code=404, detail="Document not found.")

    query_understanding.invalidate_known_drugs_cache()
    audit_log.log("DOCUMENT_DELETED", f"file={safe_filename}: {removed_chunks} chunk(s) removed",
                  ip=_client_ip(request), resource=f"document:{safe_filename}", status="SUCCESS")
    return {"filename": safe_filename, "chunks_removed": removed_chunks}


def _json_safe_records(df):
    return df.astype(object).where(df.notna(), None).to_dict(orient="records")


@app.get("/sources", dependencies=[Depends(require_user)])
def list_sources():
    return document_records()


@app.get("/sources/{drug_name}", dependencies=[Depends(require_user)])
def sources_for_drug(drug_name: str):
    return [item for item in document_records()
            if item["drug_name"].lower() == drug_name.lower()]


@app.get("/documents", dependencies=[Depends(require_admin_key)])
def list_documents(page: int = 1, page_size: int = 25, drug: str | None = None,
                   source_type: str | None = None, search: str | None = None):
    if page < 1 or page_size < 1 or page_size > 100:
        raise HTTPException(status_code=422, detail="page must be positive and page_size must be 1-100")
    documents = document_records()
    if drug:
        documents = [item for item in documents if item["drug_name"].lower() == drug.lower()]
    if source_type:
        documents = [item for item in documents if item["source_type"].lower() == source_type.lower()]
    if search:
        needle = search.lower()
        documents = [item for item in documents if needle in item["filename"].lower()]
    start = (page - 1) * page_size
    return {"items": documents[start:start + page_size], "page": page,
            "page_size": page_size, "total": len(documents)}


@app.get("/drugs", dependencies=[Depends(require_user)])
def list_drugs():
    return {"drugs": query_understanding.known_drugs()}


@app.get("/review/pending", dependencies=[Depends(require_admin_key)])
def pending_reviews():
    return review_queue.pending()


@app.get("/review/{request_id}", dependencies=[Depends(require_admin_key)])
def get_review(request_id: str):
    try:
        return review_queue.get(request_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="unknown request id")


@app.post("/review/{request_id}", dependencies=[Depends(require_admin_key)])
def resolve_review(request_id: str, body: ReviewResolution):
    try:
        return review_queue.resolve(request_id, body.action, body.notes, body.answer)
    except KeyError:
        raise HTTPException(status_code=404, detail="unknown request id")


@app.get("/audit/verify", dependencies=[Depends(require_admin_key)])
def verify_audit(request: Request):
    ok, msg = audit_log.verify()
    audit_log.log(
        "AUDIT_VERIFIED",
        f"integrity_check={'passed' if ok else 'failed'}: {msg}",
        ip=_client_ip(request),
        status="SUCCESS" if ok else "FAILED",
    )
    return {"valid": ok, "message": msg, "entries": len(audit_log)}


@app.get("/redaction/status", dependencies=[Depends(require_admin_key)])
def get_redaction_status():
    return redaction.redaction_status()


@app.get("/audit/logs", dependencies=[Depends(require_admin_key)])
def list_audit_logs(limit: int = 100, offset: int = 0):
    return {"entries": audit_log.entries(limit=limit, offset=offset), "total": len(audit_log)}


@app.get("/dashboard/stats", dependencies=[Depends(require_admin_key)])
def dashboard_stats():
    table = get_table()
    n_chunks = 0
    n_documents = 0
    if table is not None:
        n_chunks = table.count_rows()
        n_documents = len(distinct_values("source_file"))
    ok, _ = audit_log.verify()
    return {
        "documents_indexed": n_documents,
        "chunks_indexed": n_chunks,
        "pending_reviews": len(review_queue.pending()),
        "audit_entries": len(audit_log),
        "audit_chain_valid": ok,
    }


@app.get("/dashboard/data", dependencies=[Depends(require_admin_key)])
def dashboard_data():
    documents = sorted(
        document_records(),
        key=lambda item: item.get("ingestion_timestamp") or "",
        reverse=True,
    )
    source_counts = {}
    for document in documents:
        source = document["source_type"]
        source_counts[source] = source_counts.get(source, 0) + 1
    recent_uploads = [
        {**document, "status": "Processed"}
        for document in documents[:5]
    ]
    return {
        "source_distribution": [
            {"name": name, "count": count}
            for name, count in sorted(source_counts.items())
        ],
        "recent_uploads": recent_uploads,
        "recent_activity": audit_log.entries(limit=5),
        "processing_activity": recent_activity(),
    }


@app.get("/dashboard/history", dependencies=[Depends(require_admin_key)])
def dashboard_history(days: int = 30):
    return history(days)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)