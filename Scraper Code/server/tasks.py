"""Background scrape execution + progress tracking.

Runs on a shared thread pool. Live counters are kept in-memory (so the UI can
poll cheaply) and mirrored to the ``scrape_runs`` row so completed runs
survive process restarts. Job rows are batch-upserted at the end via the
store's ``upsert_jobs``.
"""

from __future__ import annotations

import logging
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from src.ats import get_scraper
from src.http_client import build_session
from src.models import JobDetail, SearchFilters

from .companies import get_company
from .store import Store, get_store

log = logging.getLogger(__name__)


_STATE_LOCK = threading.Lock()
_STATES: dict[UUID, "RunState"] = {}
_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="scrape-run")


class RunState:
    """Live counters for one in-flight scrape."""

    __slots__ = (
        "run_id", "company_id", "company_name", "platform", "filters",
        "careers_url_override",
        "status", "stubs_seen", "details_fetched", "matched", "errors",
        "total_pages", "error_message", "started_at", "finished_at", "_lock",
    )

    def __init__(
        self,
        run_id: UUID,
        company_id: str,
        company_name: str | None,
        platform: str,
        filters: dict[str, Any],
        careers_url_override: str | None = None,
    ) -> None:
        self.run_id = run_id
        self.company_id = company_id
        self.company_name = company_name
        self.platform = platform
        self.filters = filters
        self.careers_url_override = careers_url_override
        self.status = "queued"
        self.stubs_seen = 0
        self.details_fetched = 0
        self.matched = 0
        self.errors = 0
        self.total_pages = 0
        self.error_message: str | None = None
        self.started_at: datetime = datetime.now(timezone.utc)
        self.finished_at: datetime | None = None
        self._lock = threading.Lock()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "id": self.run_id,
                "company_id": self.company_id,
                "company_name": self.company_name,
                "platform": self.platform,
                "filters": self.filters,
                "status": self.status,
                "stubs_seen": self.stubs_seen,
                "details_fetched": self.details_fetched,
                "matched": self.matched,
                "errors": self.errors,
                "total_pages": self.total_pages,
                "error_message": self.error_message,
                "started_at": self.started_at,
                "finished_at": self.finished_at,
            }

    def update(self, **fields: Any) -> None:
        with self._lock:
            for key, value in fields.items():
                setattr(self, key, value)


def get_state(run_id: UUID) -> RunState | None:
    with _STATE_LOCK:
        return _STATES.get(run_id)


def list_states(limit: int = 50) -> list[RunState]:
    with _STATE_LOCK:
        return sorted(
            _STATES.values(), key=lambda s: s.started_at, reverse=True
        )[:limit]


def _register(state: RunState) -> None:
    with _STATE_LOCK:
        _STATES[state.run_id] = state


def _serialise_filters(filters: SearchFilters) -> dict[str, Any]:
    def _iso(d: date | None) -> str | None:
        return d.isoformat() if d else None

    return {
        "keyword": filters.keyword,
        "location": filters.location,
        "country": filters.country,
        "employment_type": filters.employment_type,
        "date_exact": _iso(filters.date_exact),
        "date_from": _iso(filters.date_from),
        "date_to": _iso(filters.date_to),
        "limit": filters.limit,
        "max_pages": filters.max_pages,
        "max_workers": filters.max_workers,
    }


def _job_to_row(run_id: UUID, company_id: str, job: JobDetail) -> dict[str, Any]:
    return {
        "run_id": str(run_id),
        "company_id": company_id,
        "source": job.source,
        "job_id": job.job_id,
        "title": job.title,
        "location": job.location,
        "country": job.country,
        "date_posted": job.date_posted.isoformat() if job.date_posted else None,
        "detail_url": job.detail_url,
        "employment_type": job.employment_type,
        "hiring_org": job.hiring_org,
        "description": job.description,
    }


def _instrument_scraper(scraper, state: RunState) -> None:
    """Wrap discover_stubs / fetch_detail so live counters update as we go."""
    orig_discover = scraper.discover_stubs
    orig_fetch = scraper.fetch_detail

    def counted_discover(filters: SearchFilters):
        stubs, total_pages = orig_discover(filters)
        state.update(stubs_seen=len(stubs), total_pages=total_pages)
        return stubs, total_pages

    def counted_fetch(stub):
        try:
            detail = orig_fetch(stub)
        except Exception:
            with state._lock:
                state.errors += 1
            raise
        with state._lock:
            state.details_fetched += 1
        return detail

    scraper.discover_stubs = counted_discover  # type: ignore[assignment]
    scraper.fetch_detail = counted_fetch  # type: ignore[assignment]


def _run(state: RunState, filters: SearchFilters) -> None:
    store: Store = get_store()
    try:
        state.update(status="running")
        store.insert_run(
            {
                "id": str(state.run_id),
                "company_id": state.company_id,
                "company_name": state.company_name,
                "platform": state.platform,
                "filters": state.filters,
                "status": state.status,
                "started_at": state.started_at,
            }
        )

        scraper_cls = get_scraper(state.platform)
        # Refresh the company row so plugins with per-company config
        # (e.g. Workday) can read careers_url / extras.
        company = get_company(state.company_id, store=store) or {
            "id": state.company_id,
            "name": state.company_name,
        }
        if state.careers_url_override:
            company = {**company, "careers_url": state.careers_url_override}
            log.info(
                "run %s: using careers_url_override=%s",
                state.run_id, state.careers_url_override,
            )
        session = build_session()
        try:
            scraper = scraper_cls(session=session, company=company)
            _instrument_scraper(scraper, state)
            result = scraper.scrape(filters)
        finally:
            session.close()

        state.update(
            stubs_seen=result.stubs_seen,
            details_fetched=result.details_fetched,
            errors=result.detail_errors,
            total_pages=result.total_pages,
            matched=len(result.jobs),
        )

        rows = [_job_to_row(state.run_id, state.company_id, j) for j in result.jobs
                if j.job_id and j.title and j.detail_url]
        if rows:
            store.upsert_jobs(rows)

        state.update(status="succeeded", finished_at=datetime.now(timezone.utc))
    except Exception as exc:  # noqa: BLE001 - report to the run row
        log.exception("scrape run %s failed", state.run_id)
        state.update(
            status="failed",
            error_message=f"{type(exc).__name__}: {exc}",
            finished_at=datetime.now(timezone.utc),
        )
    finally:
        try:
            store.update_run(
                state.run_id,
                {
                    "status": state.status,
                    "stubs_seen": state.stubs_seen,
                    "details_fetched": state.details_fetched,
                    "matched": state.matched,
                    "errors": state.errors,
                    "total_pages": state.total_pages,
                    "error_message": state.error_message,
                    "finished_at": state.finished_at,
                },
            )
        except Exception:
            log.error("could not finalise run row %s:\n%s", state.run_id, traceback.format_exc())


def start_run(
    *,
    company_id: str,
    company_name: str | None,
    platform: str,
    filters: SearchFilters,
    careers_url_override: str | None = None,
) -> RunState:
    """Create a run, start its worker, and return the initial state."""
    run_id = uuid4()
    serialised = _serialise_filters(filters)
    state = RunState(
        run_id, company_id, company_name, platform, serialised,
        careers_url_override=careers_url_override,
    )
    _register(state)
    _EXECUTOR.submit(_run, state, filters)
    return state


__all__ = ["RunState", "start_run", "get_state", "list_states"]
