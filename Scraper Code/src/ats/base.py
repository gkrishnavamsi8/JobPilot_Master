"""Abstract base class shared by every ATS scraper.

Subclasses implement two methods:

- :meth:`BaseAtsScraper.discover_stubs` - fetch listing/API pages and return
  minimal :class:`~src.models.JobStub` references, ideally applying whichever
  filters the source supports natively (keyword/location/facets).
- :meth:`BaseAtsScraper.fetch_detail` - hydrate a single :class:`JobStub` into
  a full :class:`~src.models.JobDetail`.

The default :meth:`BaseAtsScraper.scrape` orchestrates the two: it collects
stubs, fetches details in parallel, then applies the same
:class:`~src.models.SearchFilters` again client-side so the final result is
always consistent regardless of what the source can filter natively.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import ClassVar

from requests import Session

from ..http_client import build_session
from ..models import JobDetail, JobStub, ScrapeResult, SearchFilters

log = logging.getLogger(__name__)


class BaseAtsScraper(ABC):
    """Template-method base class for a portal-specific scraper."""

    #: Short identifier used by the CLI and stored as JobDetail.source.
    name: ClassVar[str] = ""
    #: Human-readable label for logs / CLI listings.
    display_name: ClassVar[str] = ""

    def __init__(
        self,
        session: Session | None = None,
        *,
        company: dict | None = None,
    ) -> None:
        """
        ``company``: optional dict from the companies row (id, name,
        careers_url, extras, etc.). Subclasses may consult it to pick up
        per-company config (e.g. a Workday tenant URL) without every caller
        having to know each plugin's shape.
        """
        self._owns_session = session is None
        self.session: Session = session or build_session()
        self.company: dict = company or {}

    def close(self) -> None:
        if self._owns_session:
            self.session.close()

    def __enter__(self) -> "BaseAtsScraper":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    # ---------------------- subclass surface ----------------------

    @abstractmethod
    def discover_stubs(self, filters: SearchFilters) -> tuple[list[JobStub], int]:
        """Return ``(stubs, total_pages)`` matching the given filters.

        Implementations should push filters to the remote API where supported
        (e.g. AstraZeneca's ``?Keywords=`` / ``?Location=``, Workday's
        ``appliedFacets``). Filters the source cannot honour will be applied
        again client-side in :meth:`scrape`.
        """

    @abstractmethod
    def fetch_detail(self, stub: JobStub) -> JobDetail:
        """Fetch the full detail record for a single stub."""

    # ---------------------- orchestration ----------------------

    def scrape(self, filters: SearchFilters) -> ScrapeResult:
        """Run a full scrape: discover -> fetch details -> post-filter."""
        result = ScrapeResult(platform=self.name)

        stubs, total_pages = self.discover_stubs(filters)
        result.total_pages = total_pages
        result.stubs_seen = len(stubs)
        log.info(
            "%s: discovered %d job stub(s) across %d listing page(s)",
            self.name, len(stubs), total_pages,
        )

        if not stubs:
            return result

        matches: list[JobDetail] = []
        errors = 0

        max_workers = max(1, filters.max_workers)
        with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix=f"{self.name}-detail") as pool:
            futures = {pool.submit(self.fetch_detail, stub): stub for stub in stubs}
            for future in as_completed(futures):
                stub = futures[future]
                try:
                    detail = future.result()
                except Exception as exc:  # noqa: BLE001 - keep the loop resilient
                    errors += 1
                    log.warning(
                        "%s: failed to fetch detail for %s (%s): %s",
                        self.name, stub.job_id, stub.detail_url, exc,
                    )
                    continue

                if not detail.source:
                    detail.source = self.name
                if apply_client_filters(detail, filters):
                    matches.append(detail)
                    if filters.limit and len(matches) >= filters.limit:
                        # Cancel outstanding work - we already have enough matches.
                        for f in futures:
                            if not f.done():
                                f.cancel()
                        break

        result.details_fetched = len(stubs) - errors
        result.detail_errors = errors
        result.jobs = matches
        log.info(
            "%s: fetched %d detail(s), %d matched filters, %d error(s)",
            self.name, result.details_fetched, len(matches), errors,
        )
        return result


def _contains(haystack: str | None, needle: str | None) -> bool:
    if not needle:
        return True
    if not haystack:
        return False
    return needle.lower() in haystack.lower()


def apply_client_filters(job: JobDetail, filters: SearchFilters) -> bool:
    """Return True if ``job`` satisfies every active filter.

    Each check short-circuits so an "unset" filter is always considered a
    match. Comparison is case-insensitive substring for text fields and exact
    equality for dates.
    """
    if filters.keyword:
        hay = " ".join(x for x in (job.title, job.description, job.location) if x)
        if not _contains(hay, filters.keyword):
            return False

    if filters.location and not _contains(job.location, filters.location):
        return False

    if filters.country and not _contains(job.country, filters.country):
        return False

    if filters.employment_type and not _contains(job.employment_type, filters.employment_type):
        return False

    if filters.date_exact and job.date_posted != filters.date_exact:
        return False

    if filters.date_from and (job.date_posted is None or job.date_posted < filters.date_from):
        return False

    if filters.date_to and (job.date_posted is None or job.date_posted > filters.date_to):
        return False

    return True


__all__ = ["BaseAtsScraper", "apply_client_filters"]
