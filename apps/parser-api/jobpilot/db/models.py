import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, Float, String, Text, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    pass


class CandidateRecord(Base):
    """Stored candidate profile — full JSON payload for downstream use."""

    __tablename__ = "candidates"

    id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False), index=True, nullable=True
    )
    email: Mapped[str | None] = mapped_column(String(320), index=True, nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resume_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    resume_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class UserRecord(Base):
    """Application login account. A user owns at most one active candidate profile."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )


class JobApplicationRecord(Base):
    """Apply/view events logged from the Jobs UI (INTEGRATION_PLAN Phase 0 table)."""

    __tablename__ = "job_applications"

    id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False), index=True, nullable=True
    )
    candidate_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False), index=True, nullable=True
    )
    scraped_job_id: Mapped[str | None] = mapped_column(String(512), index=True, nullable=True)
    detail_url: Mapped[str] = mapped_column(Text, nullable=False)
    job_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    weighted_match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    match_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="viewed")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
