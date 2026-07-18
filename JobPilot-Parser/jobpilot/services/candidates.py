"""Persist and retrieve candidate records."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from jobpilot.db.models import CandidateRecord
from jobpilot.models.candidate import CandidateData
from jobpilot.services.merge import merge_candidate_data


def _index_fields(data: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    profile = data.get("profile") or {}
    return profile.get("email"), profile.get("first_name"), profile.get("last_name")


def create_candidate(
    db: Session,
    payload: CandidateData,
    *,
    resume_path: str | None = None,
    resume_filename: str | None = None,
) -> CandidateRecord:
    data = payload.model_dump(mode="json")
    email, first_name, last_name = _index_fields(data)
    record = CandidateRecord(
        id=str(uuid.uuid4()),
        email=email,
        first_name=first_name,
        last_name=last_name,
        resume_path=resume_path,
        resume_filename=resume_filename,
        data=data,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def update_candidate(
    db: Session,
    candidate_id: str,
    payload: CandidateData,
    *,
    resume_path: str | None = None,
    resume_filename: str | None = None,
) -> CandidateRecord | None:
    record = db.get(CandidateRecord, candidate_id)
    if not record:
        return None

    merged = merge_candidate_data(record.data, payload.model_dump(mode="json"))
    email, first_name, last_name = _index_fields(merged)

    record.data = merged
    record.email = email
    record.first_name = first_name
    record.last_name = last_name
    record.updated_at = datetime.now(UTC)
    if resume_path:
        record.resume_path = resume_path
    if resume_filename:
        record.resume_filename = resume_filename

    db.commit()
    db.refresh(record)
    return record


def get_candidate(db: Session, candidate_id: str) -> CandidateRecord | None:
    return db.get(CandidateRecord, candidate_id)


def list_candidates(db: Session) -> list[CandidateRecord]:
    return db.query(CandidateRecord).order_by(CandidateRecord.updated_at.desc()).all()


def candidate_to_response(record: CandidateRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "email": record.email,
        "first_name": record.first_name,
        "last_name": record.last_name,
        "resume_filename": record.resume_filename,
        "data": record.data,
        "created_at": record.created_at.isoformat(),
        "updated_at": record.updated_at.isoformat(),
    }
