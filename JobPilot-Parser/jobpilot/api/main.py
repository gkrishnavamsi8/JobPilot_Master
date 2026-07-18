"""FastAPI — collect candidate data, parse resume, store in DB."""

from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field, ValidationError
from sqlalchemy.orm import Session

from jobpilot.config import settings
from jobpilot.db.models import UserRecord
from jobpilot.db.session import check_db_connection, get_db, init_db
from jobpilot.models.candidate import CandidateData, ParsedResumeResult
from jobpilot.services.applications import (
    ALLOWED_STATUSES,
    application_to_response,
    list_applications,
    update_status,
    upsert_application,
)
from jobpilot.services.auth import (
    create_token,
    create_user,
    decode_token,
    get_user,
    get_user_by_email,
    user_to_response,
    verify_password,
)
from jobpilot.services.candidates import (
    candidate_to_response,
    create_candidate,
    get_candidate,
    get_candidate_for_user,
    list_candidates,
    update_candidate,
)
from jobpilot.services.match_text import build_match_text
from jobpilot.services.merge import merge_candidate_data
from jobpilot.services.resume import parse_resume_bytes
from jobpilot.services.text_extract import extract_text_from_bytes


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="JobPilot API",
    description="Store job application profiles in DB; auto-fill from resume parser",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DbSession = Annotated[Session, Depends(get_db)]


def _user_from_authorization(db: Session, authorization: str | None) -> UserRecord | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    user_id = decode_token(authorization[7:].strip())
    if not user_id:
        return None
    return get_user(db, user_id)


def get_current_user(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> UserRecord:
    user = _user_from_authorization(db, authorization)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def get_optional_user(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> UserRecord | None:
    return _user_from_authorization(db, authorization)


CurrentUser = Annotated[UserRecord, Depends(get_current_user)]
OptionalUser = Annotated[UserRecord | None, Depends(get_optional_user)]


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@app.post("/auth/register")
def register(payload: RegisterRequest, db: DbSession) -> dict[str, Any]:
    if get_user_by_email(db, payload.email):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = create_user(db, payload.email, payload.password, payload.full_name)
    return {"token": create_token(user.id), "user": user_to_response(user)}


@app.post("/auth/login")
def login(payload: LoginRequest, db: DbSession) -> dict[str, Any]:
    user = get_user_by_email(db, payload.email)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": create_token(user.id), "user": user_to_response(user)}


@app.get("/auth/me")
def me(user: CurrentUser) -> dict[str, Any]:
    return user_to_response(user)


# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------


class ApplicationRequest(BaseModel):
    detail_url: str
    candidate_id: str | None = None
    scraped_job_id: str | None = None
    job_title: str | None = None
    company: str | None = None
    location: str | None = None
    match_score: float | None = None
    weighted_match_score: float | None = None
    match_snapshot: dict[str, Any] | None = None
    status: str = "viewed"


class ApplicationStatusRequest(BaseModel):
    status: str


@app.post("/applications")
def log_application(
    payload: ApplicationRequest, user: CurrentUser, db: DbSession
) -> dict[str, Any]:
    """Log a viewed/applied/skipped event from the Jobs UI (one row per user+job)."""
    if payload.status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=422, detail=f"status must be one of {sorted(ALLOWED_STATUSES)}"
        )
    record = upsert_application(
        db,
        user_id=user.id,
        candidate_id=payload.candidate_id,
        detail_url=payload.detail_url,
        scraped_job_id=payload.scraped_job_id,
        job_title=payload.job_title,
        company=payload.company,
        location=payload.location,
        match_score=payload.match_score,
        weighted_match_score=payload.weighted_match_score,
        match_snapshot=payload.match_snapshot,
        status=payload.status,
    )
    return application_to_response(record)


@app.get("/applications")
def fetch_applications(user: CurrentUser, db: DbSession) -> list[dict[str, Any]]:
    return [application_to_response(r) for r in list_applications(db, user.id)]


@app.patch("/applications/{application_id}")
def patch_application(
    application_id: str,
    payload: ApplicationStatusRequest,
    user: CurrentUser,
    db: DbSession,
) -> dict[str, Any]:
    if payload.status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=422, detail=f"status must be one of {sorted(ALLOWED_STATUSES)}"
        )
    record = update_status(db, application_id, user.id, payload.status)
    if record is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return application_to_response(record)


def _save_resume_bytes(content: bytes, filename: str) -> tuple[str, str]:
    if not content:
        raise HTTPException(status_code=400, detail="Empty resume file")
    safe_name = f"{uuid.uuid4().hex}_{filename}"
    path = settings.upload_dir / safe_name
    settings.ensure_dirs()
    path.write_bytes(content)
    return str(path), filename


def _save_resume_file(upload: UploadFile) -> tuple[str, str]:
    content = upload.file.read()
    filename = upload.filename or "resume.pdf"
    return _save_resume_bytes(content, filename)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
def health_db() -> dict[str, str]:
    """Verify Supabase/Postgres connection."""
    try:
        check_db_connection()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Database unreachable: {exc}") from exc
    backend = "postgres" if settings.is_postgres else "sqlite"
    return {"status": "ok", "database": backend}


@app.get("/schema/candidate")
def candidate_schema() -> dict[str, Any]:
    """JSON Schema for the UI form."""
    return CandidateData.model_json_schema()


@app.post("/resume/parse", response_model=ParsedResumeResult)
async def parse_resume(resume: UploadFile = File(...)) -> ParsedResumeResult:
    """
    Upload a resume (PDF/DOCX/TXT) and get structured fields for UI auto-fill.

    The UI should populate empty form fields from `extracted` and show
    `filled_fields` so the user knows what was detected automatically.
    """
    content = await resume.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty resume file")

    try:
        text = extract_text_from_bytes(content, resume.filename or "resume.pdf")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from resume")

    return parse_resume_bytes(content, resume.filename or "resume.pdf")


@app.post("/candidates")
async def save_candidate(
    db: DbSession,
    user: OptionalUser,
    candidate_json: str = Form(..., description="JSON matching CandidateData"),
    resume: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    """
    Save candidate profile to the database.

    Typical UI flow:
    1. POST /resume/parse → auto-fill form
    2. User reviews/edits remaining fields (address, work auth, etc.)
    3. POST /candidates → persist to DB for your other tools
    """
    try:
        payload = CandidateData.model_validate(json.loads(candidate_json))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    resume_path = resume_filename = None
    if resume:
        resume_path, resume_filename = _save_resume_file(resume)

    # A logged-in user keeps one profile: update it in place if it exists.
    existing = get_candidate_for_user(db, user.id) if user else None
    if existing:
        record = update_candidate(
            db,
            existing.id,
            payload,
            resume_path=resume_path,
            resume_filename=resume_filename,
        )
    else:
        record = create_candidate(
            db,
            payload,
            resume_path=resume_path,
            resume_filename=resume_filename,
            user_id=user.id if user else None,
        )
    return candidate_to_response(record)


@app.post("/candidates/parse-and-save")
async def parse_and_save_candidate(
    db: DbSession,
    resume: UploadFile = File(...),
    extra_json: str | None = Form(
        default=None,
        description="Optional JSON (CandidateData) to merge over parsed values",
    ),
) -> dict[str, Any]:
    """
    One-shot: upload resume, parse it, merge optional UI overrides, save to DB.
    """
    content = await resume.read()
    try:
        text = extract_text_from_bytes(content, resume.filename or "resume.pdf")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    parsed = parse_resume_bytes(content, resume.filename or "resume.pdf").extracted.model_dump(mode="json")
    merged = parsed
    if extra_json:
        try:
            user = CandidateData.model_validate(json.loads(extra_json)).model_dump(mode="json")
            merged = merge_candidate_data(parsed, user)
        except (json.JSONDecodeError, ValidationError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    resume_path, resume_filename = _save_resume_bytes(
        content, resume.filename or "resume.pdf"
    )

    record = create_candidate(
        db,
        CandidateData.model_validate(merged),
        resume_path=resume_path,
        resume_filename=resume_filename,
    )
    response = candidate_to_response(record)
    response["auto_filled_from_resume"] = True
    return response


@app.put("/candidates/{candidate_id}")
async def update_candidate_record(
    candidate_id: str,
    db: DbSession,
    candidate_json: str = Form(...),
    resume: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    try:
        payload = CandidateData.model_validate(json.loads(candidate_json))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    resume_path = resume_filename = None
    if resume:
        resume_path, resume_filename = _save_resume_file(resume)

    record = update_candidate(
        db,
        candidate_id,
        payload,
        resume_path=resume_path,
        resume_filename=resume_filename,
    )
    if not record:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate_to_response(record)


@app.get("/candidates/me")
def fetch_my_candidate(user: CurrentUser, db: DbSession) -> dict[str, Any]:
    """Current user's saved profile (INTEGRATION_PLAN API addition)."""
    record = get_candidate_for_user(db, user.id)
    if not record:
        raise HTTPException(status_code=404, detail="No profile saved yet")
    return candidate_to_response(record)


@app.get("/candidates/{candidate_id}")
def fetch_candidate(candidate_id: str, db: DbSession) -> dict[str, Any]:
    record = get_candidate(db, candidate_id)
    if not record:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate_to_response(record)


@app.get("/candidates/{candidate_id}/match-text")
def fetch_candidate_match_text(candidate_id: str, db: DbSession) -> dict[str, str]:
    record = get_candidate(db, candidate_id)
    if not record:
        raise HTTPException(status_code=404, detail="Candidate not found")
    data = CandidateData.model_validate(record.data)
    return {"candidate_id": candidate_id, "match_text": build_match_text(data)}


@app.get("/candidates")
def fetch_candidates(db: DbSession) -> list[dict[str, Any]]:
    return [candidate_to_response(r) for r in list_candidates(db)]
