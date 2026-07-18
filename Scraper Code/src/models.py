"""Platform-neutral domain models shared by every ATS scraper.

Concrete scrapers under ``src.ats`` produce and consume these dataclasses so
that downstream code (``db.py``, ``excel_writer.py``, CLI output) never has to
care which portal a job came from.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any


@dataclass(frozen=True)
class JobStub:
    """A minimal job reference discovered from a listing page/API."""

    job_id: str
    title: str
    detail_url: str
    location: str | None = None
    source: str = ""  # populated by the scraper


@dataclass
class JobDetail:
    """A fully-hydrated job record ready for storage or export."""

    job_id: str
    title: str
    detail_url: str
    source: str
    location: str | None = None
    country: str | None = None
    date_posted: date | None = None
    employment_type: str | None = None
    hiring_org: str | None = None
    description: str | None = None
    raw: dict[str, Any] | None = field(default=None, repr=False)


@dataclass
class SearchFilters:
    """Runtime filters requested by the CLI.

    Every field is optional. Concrete scrapers may push some filters to the
    remote API (server-side); the base class then applies the same filters
    again client-side so behaviour is uniform regardless of what the source
    supports.
    """

    # Text / facet filters
    keyword: str | None = None
    location: str | None = None
    country: str | None = None
    employment_type: str | None = None

    # Date filters
    date_exact: date | None = None
    date_from: date | None = None
    date_to: date | None = None

    # Result shaping
    limit: int | None = None
    max_pages: int | None = None
    max_workers: int = 8

    def has_client_filter(self) -> bool:
        """True if any client-side post filter is active."""
        return any(
            [
                self.keyword,
                self.location,
                self.country,
                self.employment_type,
                self.date_exact,
                self.date_from,
                self.date_to,
            ]
        )


@dataclass
class ScrapeResult:
    """Summary of a single scrape run."""

    platform: str
    total_pages: int = 0
    stubs_seen: int = 0
    details_fetched: int = 0
    detail_errors: int = 0
    jobs: list[JobDetail] = field(default_factory=list)


__all__ = ["JobStub", "JobDetail", "SearchFilters", "ScrapeResult"]
