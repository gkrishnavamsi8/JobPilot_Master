"""HTTP routes for the jobpilot API."""

from __future__ import annotations

import io
import logging
import os
import tempfile
from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import StreamingResponse

from src.ats import list_platforms as list_ats_platforms
from src.excel_writer import write_jobs as write_excel
from src.models import JobDetail, SearchFilters

from .companies import companies_mapping, get_company, list_companies
from .schemas import (
    Company,
    DateScope,
    Filters,
    Health,
    JobBrowsePage,
    JobBrowseRow,
    JobFacets,
    JobRow,
    JobsPage,
    PlatformInfo,
    Run,
    ScrapeRequest,
    ScrapeResponse,
)
from .store import get_store
from .tasks import get_state, list_states, start_run

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


# ---------------------------- health ----------------------------

@router.get("/health", response_model=Health)
def health() -> Health:
    try:
        store = get_store()
        info = store.health()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"storage backend error: {exc}")

    detected: dict[str, str | None] | None = None
    companies_status = info.get("companies_table", "unknown")
    try:
        detected = companies_mapping()
    except Exception as exc:  # noqa: BLE001
        companies_status = f"error: {exc}"

    runs_status = info.get("scrape_runs_table")
    jobs_status = info.get("scraped_jobs_table")

    hint = None
    missing = [
        name for name, status in (
            ("scrape_runs", runs_status),
            ("scraped_jobs", jobs_status),
        ) if status == "missing"
    ]
    if missing:
        hint = (
            f"Missing table(s) in Supabase: {', '.join(missing)}. "
            "Open Supabase Dashboard -> SQL Editor and run db/schema.sql "
            "from the repo root (idempotent)."
        )

    ok = (
        bool(info.get("reachable"))
        and companies_status == "ok"
        and runs_status == "ok"
        and jobs_status == "ok"
    )
    return Health(
        ok=ok,
        database=info.get("database", "unknown"),
        companies_table=companies_status,
        scrape_runs_table=runs_status,
        scraped_jobs_table=jobs_status,
        detected_columns=detected,
        hint=hint,
    )


# ---------------------------- platforms ----------------------------

@router.get("/platforms", response_model=list[PlatformInfo])
def get_platforms() -> list[PlatformInfo]:
    return [PlatformInfo(name=n) for n in list_ats_platforms()]


# ---------------------------- companies ----------------------------

@router.get("/companies", response_model=list[Company])
def get_companies(
    q: str | None = Query(default=None, description="Substring match on name/URL/platform."),
    platform: str | None = Query(default=None, description="Filter by detected platform."),
    include_inactive: bool = Query(default=False),
) -> list[Company]:
    supported = set(list_ats_platforms())
    rows = list_companies(
        query=q,
        platform=platform,
        supported_platforms=supported,
        include_inactive=include_inactive,
    )
    return [Company(**row) for row in rows]


# ---------------------------- scrape ----------------------------

def _resolve_filters(f: Filters) -> SearchFilters:
    """Convert API Filters -> internal SearchFilters, expanding date_scope."""
    date_exact: date | None = None
    date_from: date | None = None
    date_to: date | None = None

    if f.date_scope == DateScope.today:
        tz_name = os.getenv("SCRAPE_TZ", "UTC")
        try:
            tz = ZoneInfo(tz_name)
        except ZoneInfoNotFoundError:
            tz = ZoneInfo("UTC")
        date_exact = datetime.now(tz).date()
    elif f.date_scope == DateScope.date:
        if not f.date_exact:
            raise HTTPException(status_code=422, detail="date_scope=date requires date_exact")
        date_exact = f.date_exact
    elif f.date_scope == DateScope.range:
        if not f.date_from and not f.date_to:
            raise HTTPException(
                status_code=422,
                detail="date_scope=range requires at least date_from or date_to",
            )
        date_from = f.date_from
        date_to = f.date_to
    # DateScope.all -> keep all Nones

    return SearchFilters(
        keyword=f.keyword,
        location=f.location,
        country=f.country,
        employment_type=f.employment_type,
        date_exact=date_exact,
        date_from=date_from,
        date_to=date_to,
        limit=f.limit,
        max_pages=f.max_pages,
        max_workers=f.max_workers,
    )


@router.post("/scrape", response_model=ScrapeResponse)
def post_scrape(req: ScrapeRequest) -> ScrapeResponse:
    company = get_company(req.company_id)
    if company is None:
        raise HTTPException(status_code=404, detail=f"company_id={req.company_id!r} not found")

    platform = company.get("platform")
    if not platform:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Could not determine ATS platform for company {company['name']!r} "
                f"(careers_url={company.get('careers_url')!r}, "
                f"raw_platform={company.get('raw_platform')!r})."
            ),
        )
    if platform not in list_ats_platforms():
        raise HTTPException(
            status_code=400,
            detail=(
                f"Platform {platform!r} detected for {company['name']!r} but no scraper "
                f"plugin is registered. Available: {sorted(list_ats_platforms())}."
            ),
        )

    filters = _resolve_filters(req.filters)
    state = start_run(
        company_id=company["id"],
        company_name=company["name"],
        platform=platform,
        filters=filters,
        careers_url_override=req.careers_url_override,
    )
    return ScrapeResponse(run_id=state.run_id, status=state.status)


# ---------------------------- runs ----------------------------

def _merge_run(persisted: dict | None, live_snapshot: dict | None) -> dict | None:
    if persisted is None and live_snapshot is None:
        return None
    persisted = dict(persisted or {})
    if live_snapshot:
        persisted.update(live_snapshot)
    return persisted


@router.get("/runs", response_model=list[Run])
def get_runs(limit: int = Query(default=20, ge=1, le=200)) -> list[Run]:
    store = get_store()
    persisted = {r["id"]: r for r in store.list_runs(limit=limit)}
    live = {str(s.run_id): s.snapshot() for s in list_states(limit=limit)}

    merged: dict[str, dict] = {}
    for run_id, row in persisted.items():
        merged[run_id] = row
    for run_id, snap in live.items():
        base = merged.get(run_id, {})
        snap_serial = {**snap, "id": str(snap["id"])}
        merged[run_id] = {**base, **snap_serial}

    ordered = sorted(merged.values(), key=lambda r: r["started_at"], reverse=True)[:limit]
    return [Run(**r) for r in ordered]


@router.get("/runs/{run_id}", response_model=Run)
def get_run(run_id: UUID) -> Run:
    state = get_state(run_id)
    store = get_store()
    row = store.get_run(run_id)
    if state is None and row is None:
        raise HTTPException(status_code=404, detail=f"run {run_id} not found")
    live = None
    if state is not None:
        live = {**state.snapshot(), "id": str(state.run_id)}
    merged = _merge_run(row, live)
    assert merged is not None
    return Run(**merged)


@router.get("/runs/{run_id}/jobs", response_model=JobsPage)
def get_run_jobs(
    run_id: UUID,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> JobsPage:
    store = get_store()
    total = store.count_run_jobs(run_id)
    rows = store.list_run_jobs(run_id, limit=limit, offset=offset)
    return JobsPage(total=total, items=[JobRow(**r) for r in rows])


# ---------------------------- global jobs browse ----------------------------


def _split_csv(value: str | None) -> list[str] | None:
    """Split ``a,b,c`` into ``["a","b","c"]``; return None for empty input."""
    if not value:
        return None
    parts = [v.strip() for v in value.split(",") if v.strip()]
    return parts or None


@router.get("/jobs/facets", response_model=JobFacets)
def get_job_facets() -> JobFacets:
    """Distinct slicer values across all scraped jobs."""
    store = get_store()
    facets = store.distinct_job_facets()
    return JobFacets(**facets)


@router.get("/jobs", response_model=JobBrowsePage)
def get_jobs(
    company_ids: str | None = Query(default=None, description="Comma-separated company ids."),
    sources: str | None = Query(default=None, description="Comma-separated ATS sources (workday, astrazeneca, ...)."),
    countries: str | None = Query(default=None, description="Comma-separated country substrings (exact match on stored country)."),
    location: str | None = Query(default=None, description="Substring match on location."),
    keyword: str | None = Query(default=None, description="Substring match on title OR description."),
    employment_type: str | None = Query(default=None, description="Substring match on employment_type."),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    order: str = Query(
        default="date_posted.desc.nullslast",
        description="PostgREST order clause, e.g. 'date_posted.desc.nullslast,title.asc'.",
    ),
) -> JobBrowsePage:
    store = get_store()
    rows, total = store.list_jobs(
        company_ids=_split_csv(company_ids),
        sources=_split_csv(sources),
        countries=_split_csv(countries),
        location=location,
        keyword=keyword,
        employment_type=employment_type,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
        order=order,
    )
    return JobBrowsePage(total=total, items=[JobBrowseRow(**r) for r in rows])


@router.get("/jobs/export.xlsx")
def export_jobs_xlsx(
    company_ids: str | None = Query(default=None),
    sources: str | None = Query(default=None),
    countries: str | None = Query(default=None),
    location: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    employment_type: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    order: str = Query(default="date_posted.desc.nullslast"),
    limit: int = Query(default=10_000, ge=1, le=50_000),
) -> Response:
    """Filtered export - same filters as /api/jobs, returns an .xlsx."""
    store = get_store()
    rows, _ = store.list_jobs(
        company_ids=_split_csv(company_ids),
        sources=_split_csv(sources),
        countries=_split_csv(countries),
        location=location,
        keyword=keyword,
        employment_type=employment_type,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=0,
        order=order,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No jobs matched the filters.")

    jobs = [
        JobDetail(
            job_id=r["job_id"],
            title=r["title"],
            detail_url=r["detail_url"],
            source=r["source"],
            location=r.get("location"),
            country=r.get("country"),
            date_posted=date.fromisoformat(r["date_posted"]) if r.get("date_posted") else None,
            employment_type=r.get("employment_type"),
            hiring_org=r.get("hiring_org"),
            description=None,
        )
        for r in rows
    ]

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        path = tmp.name
    write_excel(jobs, path)
    with open(path, "rb") as f:
        payload = f.read()
    os.unlink(path)

    return StreamingResponse(
        io.BytesIO(payload),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="jobpilot-jobs.xlsx"'},
    )


# ---------------------------- per-run exports ----------------------------


@router.get("/runs/{run_id}/export.xlsx")
def export_run_xlsx(run_id: UUID) -> Response:
    store = get_store()
    rows = store.list_run_jobs(run_id, limit=10_000, offset=0)
    if not rows:
        raise HTTPException(status_code=404, detail=f"no jobs recorded for run {run_id}")

    jobs = [
        JobDetail(
            job_id=r["job_id"],
            title=r["title"],
            detail_url=r["detail_url"],
            source=r["source"],
            location=r.get("location"),
            country=r.get("country"),
            date_posted=date.fromisoformat(r["date_posted"]) if r.get("date_posted") else None,
            employment_type=r.get("employment_type"),
            hiring_org=r.get("hiring_org"),
            description=r.get("description"),
        )
        for r in rows
    ]

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        path = tmp.name
    write_excel(jobs, path)
    with open(path, "rb") as f:
        payload = f.read()
    os.unlink(path)

    return StreamingResponse(
        io.BytesIO(payload),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="run-{run_id}.xlsx"'},
    )


__all__ = ["router"]
