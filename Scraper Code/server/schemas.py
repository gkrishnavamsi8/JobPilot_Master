"""Pydantic request/response models for the API."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PlatformInfo(BaseModel):
    name: str
    display_name: str | None = None


class Company(BaseModel):
    id: str
    name: str
    careers_url: str | None = None
    platform: str | None = None
    raw_platform: str | None = None
    supported: bool = False
    is_active: bool = True
    extras: dict[str, Any] = Field(default_factory=dict)

    # Optional extras surfaced from the user's companies table when present.
    domain: str | None = None
    subdomain: str | None = None
    company_type: str | None = None
    tier: str | None = None
    priority: str | None = None
    hires_in_india: bool | None = None
    india_locations: str | None = None
    is_active: bool | None = None
    scraping_method: str | None = None

    # Persisted verdict, populated by scripts/mark_supported.py once the DDL
    # in db/schema.sql is applied. `supported` above still works standalone
    # (falls back to live computation) but this column carries the "why".
    jobpilot_supported: bool | None = None
    jobpilot_status: str | None = None


class DateScope(str, Enum):
    today = "today"
    date = "date"
    range = "range"
    all = "all"


class Filters(BaseModel):
    """Filters accepted by /api/scrape and stored on the run row."""

    model_config = ConfigDict(extra="forbid")

    date_scope: DateScope = DateScope.today
    date_exact: date | None = None
    date_from: date | None = None
    date_to: date | None = None

    keyword: str | None = None
    location: str | None = None
    country: str | None = None
    employment_type: str | None = None

    limit: int | None = Field(default=None, ge=1)
    max_pages: int | None = Field(default=None, ge=1)
    max_workers: int = Field(default=8, ge=1, le=32)


class ScrapeRequest(BaseModel):
    company_id: str
    filters: Filters = Field(default_factory=Filters)
    #: Optional per-run override for the company's careers URL. Handy for
    #: plugins with per-tenant URLs (Workday) when the company row stores a
    #: marketing landing page rather than the CXS endpoint.
    careers_url_override: str | None = None


class ScrapeResponse(BaseModel):
    run_id: UUID
    status: str


class Run(BaseModel):
    id: UUID
    company_id: str
    company_name: str | None = None
    platform: str
    filters: dict[str, Any] = Field(default_factory=dict)
    status: str
    stubs_seen: int = 0
    details_fetched: int = 0
    matched: int = 0
    errors: int = 0
    total_pages: int = 0
    error_message: str | None = None
    started_at: datetime
    finished_at: datetime | None = None


class JobRow(BaseModel):
    source: str
    job_id: str
    title: str
    location: str | None = None
    country: str | None = None
    date_posted: date | None = None
    detail_url: str
    employment_type: str | None = None
    hiring_org: str | None = None
    description: str | None = None


class JobsPage(BaseModel):
    total: int
    items: list[JobRow]


class JobBrowseRow(BaseModel):
    """A single row in the global Jobs page.

    Wider than :class:`JobRow` because it exposes ``company_id`` (so the
    frontend can resolve display names + platform) and ``scraped_at``
    (so users know how fresh the record is). ``description`` is omitted
    to keep browse responses lean.
    """

    company_id: str
    source: str
    job_id: str
    title: str
    location: str | None = None
    country: str | None = None
    date_posted: date | None = None
    detail_url: str
    employment_type: str | None = None
    hiring_org: str | None = None
    scraped_at: datetime | None = None


class JobBrowsePage(BaseModel):
    total: int
    items: list[JobBrowseRow]


class JobFacets(BaseModel):
    """Distinct slicer values, populated on page load."""

    sources: list[str] = Field(default_factory=list)
    countries: list[str] = Field(default_factory=list)
    employment_types: list[str] = Field(default_factory=list)
    company_ids: list[str] = Field(default_factory=list)


class Health(BaseModel):
    ok: bool
    database: str
    companies_table: str
    scrape_runs_table: str | None = None
    scraped_jobs_table: str | None = None
    detected_columns: dict[str, str | None] | None = None
    hint: str | None = None


__all__ = [
    "PlatformInfo",
    "Company",
    "DateScope",
    "Filters",
    "ScrapeRequest",
    "ScrapeResponse",
    "Run",
    "JobRow",
    "JobsPage",
    "JobBrowseRow",
    "JobBrowsePage",
    "JobFacets",
    "Health",
]
