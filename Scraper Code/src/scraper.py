"""Thin facade for running any registered ATS scraper.

Concrete implementations live under :mod:`src.ats`. This module simply looks
up a scraper by name, hands it a :class:`~src.models.SearchFilters`, and
returns the resulting :class:`~src.models.ScrapeResult`. It exists mainly so
callers (CLI, notebooks, tests) don't have to know about the registry.
"""

from __future__ import annotations

import logging

from requests import Session

from . import ats  # noqa: F401 - importing triggers scraper registration
from .ats import get_scraper, list_platforms
from .models import ScrapeResult, SearchFilters

log = logging.getLogger(__name__)


def run_platform(
    platform: str,
    filters: SearchFilters,
    *,
    session: Session | None = None,
    company: dict | None = None,
) -> ScrapeResult:
    """Run the named platform scraper and return its result.

    ``company`` (optional) is forwarded to the scraper so plugins with
    per-company configuration (e.g. Workday's tenant URL) can consult it.
    """
    scraper_cls = get_scraper(platform)
    log.info(
        "Starting scrape: platform=%s company=%s filters=%s",
        platform,
        (company or {}).get("name"),
        {
            "keyword": filters.keyword,
            "location": filters.location,
            "country": filters.country,
            "employment_type": filters.employment_type,
            "date_exact": filters.date_exact.isoformat() if filters.date_exact else None,
            "date_from": filters.date_from.isoformat() if filters.date_from else None,
            "date_to": filters.date_to.isoformat() if filters.date_to else None,
            "limit": filters.limit,
            "max_pages": filters.max_pages,
            "max_workers": filters.max_workers,
        },
    )
    with scraper_cls(session=session, company=company) as scraper:
        return scraper.scrape(filters)


__all__ = ["run_platform", "list_platforms"]
