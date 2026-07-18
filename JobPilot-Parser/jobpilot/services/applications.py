"""Persist job application events (viewed / applied / skipped)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from jobpilot.db.models import JobApplicationRecord

ALLOWED_STATUSES = {"viewed", "applied", "skipped"}


def upsert_application(
    db: Session,
    *,
    user_id: str,
    candidate_id: str | None,
    detail_url: str,
    scraped_job_id: str | None = None,
    job_title: str | None = None,
    company: str | None = None,
    location: str | None = None,
    match_score: float | None = None,
    weighted_match_score: float | None = None,
    match_snapshot: dict[str, Any] | None = None,
    status: str = "viewed",
) -> JobApplicationRecord:
    """Create or refresh the user's application row for a job.

    One row per (user, job): re-applying updates the score snapshot and
    status instead of duplicating history.
    """
    query = db.query(JobApplicationRecord).filter(
        JobApplicationRecord.user_id == user_id
    )
    if scraped_job_id:
        record = query.filter(
            JobApplicationRecord.scraped_job_id == scraped_job_id
        ).first()
    else:
        record = query.filter(JobApplicationRecord.detail_url == detail_url).first()

    if record is None:
        record = JobApplicationRecord(user_id=user_id, detail_url=detail_url)
        db.add(record)

    record.candidate_id = candidate_id or record.candidate_id
    record.scraped_job_id = scraped_job_id or record.scraped_job_id
    record.detail_url = detail_url
    record.job_title = job_title or record.job_title
    record.company = company or record.company
    record.location = location or record.location
    if match_score is not None:
        record.match_score = match_score
    if weighted_match_score is not None:
        record.weighted_match_score = weighted_match_score
    if match_snapshot is not None:
        record.match_snapshot = match_snapshot
    record.status = status
    record.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(record)
    return record


def list_applications(db: Session, user_id: str) -> list[JobApplicationRecord]:
    return (
        db.query(JobApplicationRecord)
        .filter(JobApplicationRecord.user_id == user_id)
        .order_by(JobApplicationRecord.updated_at.desc())
        .all()
    )


def update_status(
    db: Session, application_id: str, user_id: str, status: str
) -> JobApplicationRecord | None:
    record = db.get(JobApplicationRecord, application_id)
    if record is None or record.user_id != user_id:
        return None
    record.status = status
    record.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(record)
    return record


def application_to_response(record: JobApplicationRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "user_id": record.user_id,
        "candidate_id": record.candidate_id,
        "scraped_job_id": record.scraped_job_id,
        "detail_url": record.detail_url,
        "job_title": record.job_title,
        "company": record.company,
        "location": record.location,
        "match_score": record.match_score,
        "weighted_match_score": record.weighted_match_score,
        "match_snapshot": record.match_snapshot,
        "status": record.status,
        "created_at": record.created_at.isoformat(),
        "updated_at": record.updated_at.isoformat(),
    }
