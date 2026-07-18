"""AstraZeneca careers scraper (TalentBrew-powered listing).

The site is server-rendered HTML and paginates via ``?p=N``. It supports a few
native filters we can push server-side:

- ``Keywords`` - free-text search
- ``Location`` - free-text location
- ``Distance``/``RadiusUnitType`` - kept at defaults

Everything else (country, employment type, exact date, date range) is applied
client-side by :func:`~src.ats.base.apply_client_filters` after each detail
page has been parsed for its JSON-LD ``JobPosting`` block.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..http_client import get
from ..models import JobDetail, JobStub, SearchFilters
from ..parser import first_job_posting, parse_date, strip_html
from .base import BaseAtsScraper
from .registry import register

log = logging.getLogger(__name__)

BASE_URL = "https://careers.astrazeneca.com"
SEARCH_URL = f"{BASE_URL}/search-jobs"


def _text(node) -> str:
    return node.get_text(" ", strip=True) if node else ""


def _location_from_json_ld(job_posting: dict[str, Any]) -> tuple[str | None, str | None]:
    locations = job_posting.get("jobLocation")
    if not locations:
        return None, None
    if isinstance(locations, dict):
        locations = [locations]

    parts_all: list[str] = []
    country: str | None = None
    for loc in locations:
        if not isinstance(loc, dict):
            continue
        address = loc.get("address") or {}
        if not isinstance(address, dict):
            continue
        city = address.get("addressLocality")
        region = address.get("addressRegion")
        this_country = address.get("addressCountry")
        pieces = [p for p in (city, region, this_country) if p]
        if pieces:
            parts_all.append(", ".join(pieces))
        if this_country and country is None:
            country = this_country

    return (" | ".join(parts_all) if parts_all else None), country


def _employment_type(job_posting: dict[str, Any]) -> str | None:
    value = job_posting.get("employmentType")
    if value is None:
        return None
    if isinstance(value, list):
        return ", ".join(str(v) for v in value if v) or None
    return str(value).strip() or None


def _hiring_org(job_posting: dict[str, Any]) -> str | None:
    org = job_posting.get("hiringOrganization")
    if isinstance(org, dict):
        name = org.get("name")
        return name.strip() if isinstance(name, str) and name.strip() else None
    if isinstance(org, str) and org.strip():
        return org.strip()
    return None


def parse_listing(html: str) -> tuple[list[JobStub], int]:
    """Extract every job card from a rendered ``/search-jobs`` page."""
    soup = BeautifulSoup(html, "lxml")

    results_section = soup.select_one("#search-results")
    total_pages = 1
    if results_section is not None:
        raw = results_section.get("data-total-pages")
        if raw:
            try:
                total_pages = max(1, int(raw))
            except ValueError:
                total_pages = 1

    stubs: list[JobStub] = []
    seen_ids: set[str] = set()

    for anchor in soup.select("a.search-results-link[data-job-id]"):
        job_id = anchor.get("data-job-id", "").strip()
        if not job_id or job_id in seen_ids:
            continue
        seen_ids.add(job_id)

        href = anchor.get("href", "").strip()
        if not href:
            continue
        detail_url = urljoin(BASE_URL, href)

        title = _text(anchor.select_one("h2"))
        location = _text(anchor.select_one(".job-location"))

        stubs.append(
            JobStub(
                job_id=job_id,
                title=title,
                location=location or None,
                detail_url=detail_url,
                source="astrazeneca",
            )
        )

    return stubs, total_pages


def parse_detail(html: str, stub: JobStub) -> JobDetail:
    """Parse a job detail page, preferring JSON-LD ``JobPosting``."""
    soup = BeautifulSoup(html, "lxml")
    job_posting = first_job_posting(soup)

    detail = JobDetail(
        job_id=stub.job_id,
        title=stub.title,
        detail_url=stub.detail_url,
        source="astrazeneca",
        location=stub.location,
    )

    if job_posting is not None:
        detail.title = str(job_posting.get("title") or detail.title).strip()
        detail.detail_url = str(job_posting.get("url") or detail.detail_url).strip()
        detail.date_posted = parse_date(job_posting.get("datePosted"))
        detail.description = strip_html(job_posting.get("description"))
        detail.employment_type = _employment_type(job_posting)
        detail.hiring_org = _hiring_org(job_posting)
        loc_str, country = _location_from_json_ld(job_posting)
        if loc_str:
            detail.location = loc_str
        if country:
            detail.country = country

        identifier = job_posting.get("identifier")
        if not detail.job_id and isinstance(identifier, str) and identifier.strip():
            detail.job_id = identifier.strip()

        detail.raw = job_posting

    if detail.date_posted is None:
        job_date_span = soup.select_one("span.job-date")
        if job_date_span:
            match = re.search(r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", _text(job_date_span))
            if match:
                detail.date_posted = parse_date(match.group(1))

    if not detail.job_id:
        job_id_span = soup.select_one("span.job-id")
        if job_id_span:
            match = re.search(r"([A-Za-z0-9\-]+)$", _text(job_id_span))
            if match:
                detail.job_id = match.group(1)

    return detail


@register("astrazeneca")
class AstraZenecaScraper(BaseAtsScraper):
    """Scraper for careers.astrazeneca.com (TalentBrew)."""

    display_name = "AstraZeneca (TalentBrew)"

    def _listing_params(self, page: int, filters: SearchFilters) -> dict[str, Any]:
        # ``?p=N`` is the actual pagination parameter (``?CurrentPage=`` is a
        # no-op on this site and silently pins you to page 1).
        params: dict[str, Any] = {"p": page}
        if filters.keyword:
            params["Keywords"] = filters.keyword
        if filters.location:
            params["Location"] = filters.location
        return params

    def discover_stubs(self, filters: SearchFilters) -> tuple[list[JobStub], int]:
        first = get(self.session, SEARCH_URL, params=self._listing_params(1, filters))
        stubs, total_pages = parse_listing(first.text)

        if filters.max_pages is not None:
            total_pages = min(total_pages, filters.max_pages)

        seen = {s.job_id for s in stubs}
        for page in range(2, total_pages + 1):
            resp = get(self.session, SEARCH_URL, params=self._listing_params(page, filters))
            page_stubs, _ = parse_listing(resp.text)
            new = [s for s in page_stubs if s.job_id not in seen]
            seen.update(s.job_id for s in new)
            stubs.extend(new)
            log.info(
                "astrazeneca: page %d/%d -> +%d stubs (%d total)",
                page, total_pages, len(new), len(stubs),
            )

        return stubs, total_pages

    def fetch_detail(self, stub: JobStub) -> JobDetail:
        resp = get(self.session, stub.detail_url)
        return parse_detail(resp.text, stub)


__all__ = ["AstraZenecaScraper", "parse_listing", "parse_detail", "SEARCH_URL", "BASE_URL"]
