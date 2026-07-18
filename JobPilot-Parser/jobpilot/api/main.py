"""FastAPI — collect candidate data, parse resume, store in DB."""

from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from sqlalchemy.orm import Session

from jobpilot.config import settings
from jobpilot.db.session import check_db_connection, get_db, init_db
from jobpilot.models.candidate import CandidateData, ParsedResumeResult
from jobpilot.services.candidates import (
    candidate_to_response,
    create_candidate,
    get_candidate,
    list_candidates,
    update_candidate,
)
from jobpilot.services.merge import merge_candidate_data
from jobpilot.services.resume import parse_resume_bytes, parse_resume_text
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

    record = create_candidate(
        db,
        payload,
        resume_path=resume_path,
        resume_filename=resume_filename,
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


@app.get("/candidates/{candidate_id}")
def fetch_candidate(candidate_id: str, db: DbSession) -> dict[str, Any]:
    record = get_candidate(db, candidate_id)
    if not record:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate_to_response(record)


@app.get("/candidates")
def fetch_candidates(db: DbSession) -> list[dict[str, Any]]:
    return [candidate_to_response(r) for r in list_candidates(db)]
