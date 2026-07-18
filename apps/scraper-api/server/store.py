"""Storage layer for the API.

Two backends live behind :func:`get_store`:

- :class:`SupabaseStore` - talks to Supabase's PostgREST API using the
  ``service_role`` JWT. No direct Postgres connection, no DB password needed.
  This is the default when ``SUPABASE_URL`` and ``SUPABASE_SERVICE_KEY`` are
  set.
- :class:`PostgresStore` - psycopg-based fallback, used only if
  ``DATABASE_URL`` is set and Supabase env vars are not. Kept for parity with
  the CLI and for self-hosted setups.

Both expose the same small set of methods used by the routes and tasks.
"""

from __future__ import annotations

import json
import logging
import os
from abc import ABC, abstractmethod
from datetime import date, datetime
from typing import Any, Iterable
from urllib.parse import urljoin
from uuid import UUID

import requests
from requests import Session
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential_jitter

log = logging.getLogger(__name__)

RUNS_TABLE = "scrape_runs"
JOBS_TABLE = "scraped_jobs"
COMPANIES_TABLE = "companies"


def _to_jsonable(value: Any) -> Any:
    if isinstance(value, (datetime,)):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    return value


def _prep_row(row: dict[str, Any]) -> dict[str, Any]:
    return {k: _to_jsonable(v) for k, v in row.items()}


# ---------------------------------------------------------------------------
# Store interface
# ---------------------------------------------------------------------------


class Store(ABC):
    """Backend-neutral operations used by the API."""

    kind: str = "abstract"

    @abstractmethod
    def health(self) -> dict[str, Any]: ...

    @abstractmethod
    def list_companies(
        self,
        *,
        query: str | None = None,
        platform: str | None = None,
        include_inactive: bool = False,
    ) -> list[dict[str, Any]]: ...

    @abstractmethod
    def get_company(self, company_id: str) -> dict[str, Any] | None: ...

    @abstractmethod
    def insert_run(self, row: dict[str, Any]) -> None: ...

    @abstractmethod
    def update_run(self, run_id: UUID, patch: dict[str, Any]) -> None: ...

    @abstractmethod
    def upsert_jobs(self, rows: list[dict[str, Any]]) -> int: ...

    @abstractmethod
    def get_run(self, run_id: UUID) -> dict[str, Any] | None: ...

    @abstractmethod
    def list_runs(self, limit: int = 20) -> list[dict[str, Any]]: ...

    @abstractmethod
    def count_run_jobs(self, run_id: UUID) -> int: ...

    @abstractmethod
    def list_run_jobs(
        self, run_id: UUID, limit: int = 100, offset: int = 0
    ) -> list[dict[str, Any]]: ...

    @abstractmethod
    def list_jobs(
        self,
        *,
        company_ids: Iterable[str] | None = None,
        sources: Iterable[str] | None = None,
        countries: Iterable[str] | None = None,
        location: str | None = None,
        keyword: str | None = None,
        employment_type: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 100,
        offset: int = 0,
        order: str = "date_posted.desc.nullslast",
    ) -> tuple[list[dict[str, Any]], int]:
        """Return ``(rows, total_count)`` for the browse page."""

    @abstractmethod
    def distinct_job_facets(self) -> dict[str, list[str]]:
        """Return sorted distinct values for slicer dropdowns (source, country, ...)."""

    @abstractmethod
    def get_job_by_key(
        self, company_id: str, source: str, job_id: str
    ) -> dict[str, Any] | None: ...

    @abstractmethod
    def get_job_by_url(self, url: str) -> dict[str, Any] | None: ...


# ---------------------------------------------------------------------------
# Supabase PostgREST backend
# ---------------------------------------------------------------------------


class PostgrestError(RuntimeError):
    def __init__(self, status: int, body: str, url: str) -> None:
        super().__init__(f"PostgREST {status} for {url}: {body[:400]}")
        self.status = status
        self.body = body
        self.url = url


class SupabaseStore(Store):
    """PostgREST client for a Supabase project."""

    kind = "supabase"

    def __init__(self, url: str, service_key: str) -> None:
        self.base = url.rstrip("/") + "/rest/v1/"
        self.session: Session = requests.Session()
        self.session.headers.update(
            {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )
        self._companies_columns: list[str] | None = None
        self._company_mapping: dict[str, str | None] | None = None

    # ---- HTTP plumbing ----

    def _url(self, path: str) -> str:
        return urljoin(self.base, path.lstrip("/"))

    @retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential_jitter(initial=0.5, max=5.0),
        retry=retry_if_exception_type(requests.RequestException),
    )
    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: Any = None,
        headers: dict[str, str] | None = None,
    ) -> requests.Response:
        url = self._url(path)
        resp = self.session.request(
            method,
            url,
            params=params,
            data=json.dumps(json_body, default=_to_jsonable) if json_body is not None else None,
            headers=headers,
            timeout=30.0,
        )
        if resp.status_code >= 400:
            raise PostgrestError(resp.status_code, resp.text, url)
        return resp

    # ---- health ----

    def _probe(self, table: str) -> str:
        try:
            self._request("GET", table, params={"select": "*", "limit": 0})
            return "ok"
        except PostgrestError as exc:
            if exc.status == 404:
                return "missing"
            return f"error: {exc}"

    def health(self) -> dict[str, Any]:
        """Round-trip to confirm the PostgREST endpoint + required tables are present."""
        return {
            "database": "supabase",
            "reachable": True,
            "companies_table": self._probe(COMPANIES_TABLE),
            "scrape_runs_table": self._probe(RUNS_TABLE),
            "scraped_jobs_table": self._probe(JOBS_TABLE),
        }

    # ---- companies introspection ----

    _ID_ALIASES = ("id", "company_id", "uuid", "slug")
    _NAME_ALIASES = ("company_name", "name", "title", "display_name")
    _URL_ALIASES = (
        "official_careers_url", "careers_url", "career_url", "careers_page",
        "careers_page_url", "career_page_url", "careers", "jobs_url",
        "job_board_url", "portal_url", "website", "site", "url", "domain",
    )
    _PLATFORM_ALIASES = ("ats_platform", "platform", "ats", "ats_provider", "provider", "system")
    _ACTIVE_ALIASES = ("is_active", "active", "enabled")

    def _detect_columns(self) -> dict[str, str | None]:
        if self._company_mapping is not None:
            return self._company_mapping

        resp = self._request("GET", COMPANIES_TABLE, params={"select": "*", "limit": 1})
        rows = resp.json()
        columns = list(rows[0].keys()) if rows else []
        if not columns:
            resp2 = self._request("GET", COMPANIES_TABLE, params={"select": "*", "limit": 0})
            columns = list((resp2.json() or [{}])[0].keys()) if resp2.json() else []

        self._companies_columns = columns
        lower = {c.lower(): c for c in columns}

        def pick(aliases: tuple[str, ...]) -> str | None:
            for a in aliases:
                if a in lower:
                    return lower[a]
            return None

        mapping = {
            "id": pick(self._ID_ALIASES),
            "name": pick(self._NAME_ALIASES),
            "url": pick(self._URL_ALIASES),
            "platform": pick(self._PLATFORM_ALIASES),
            "active": pick(self._ACTIVE_ALIASES),
        }
        if not mapping["id"] or not mapping["name"]:
            raise RuntimeError(
                f"companies table missing required columns. Detected: {columns}. "
                f"Need at least an id ({self._ID_ALIASES}) and a name ({self._NAME_ALIASES})."
            )
        self._company_mapping = mapping
        log.info("companies column mapping: %s (available=%s)", mapping, columns)
        return mapping

    def companies_mapping(self) -> dict[str, str | None]:
        return dict(self._detect_columns())

    # ---- companies ----

    def list_companies(
        self,
        *,
        query: str | None = None,
        platform: str | None = None,
        include_inactive: bool = False,
    ) -> list[dict[str, Any]]:
        mapping = self._detect_columns()

        # Select every mapped column plus a few useful extras when present.
        wanted_extras = ("tier", "priority", "hires_in_india", "india_locations",
                         "company_type", "domain", "scraping_method",
                         "jobpilot_supported", "jobpilot_status")
        columns = self._companies_columns or []
        select_cols = [
            c for c in {
                mapping["id"], mapping["name"], mapping["url"], mapping["platform"],
                mapping["active"], *wanted_extras,
            } if c and c in columns
        ]
        params: dict[str, Any] = {"select": ",".join(select_cols)}

        if not include_inactive and mapping["active"]:
            params[mapping["active"]] = "eq.true"

        # PostgREST doesn't take an arbitrary substring across multiple cols in
        # one filter, so we do simple ilike on the name column when a query is
        # given and let the client further refine below.
        if query and mapping["name"]:
            params[mapping["name"]] = f"ilike.%{query}%"

        params["order"] = f"{mapping['name']}.asc"
        resp = self._request("GET", COMPANIES_TABLE, params=params)
        rows = resp.json()
        return [self._normalise_company_row(r, mapping) for r in rows]

    def _normalise_company_row(
        self, row: dict[str, Any], mapping: dict[str, str | None]
    ) -> dict[str, Any]:
        return {
            "id": str(row.get(mapping["id"])) if mapping["id"] else "",
            "name": row.get(mapping["name"]) if mapping["name"] else None,
            "careers_url": row.get(mapping["url"]) if mapping["url"] else None,
            "raw_platform": row.get(mapping["platform"]) if mapping["platform"] else None,
            "is_active": row.get(mapping["active"], True) if mapping["active"] else True,
            "extras": {
                k: v for k, v in row.items()
                if k not in {mapping["id"], mapping["name"], mapping["url"], mapping["platform"], mapping["active"]}
            },
        }

    def get_company(self, company_id: str) -> dict[str, Any] | None:
        mapping = self._detect_columns()
        if not mapping["id"]:
            return None
        params = {
            "select": ",".join([c for c in mapping.values() if c] + [
                c for c in ("tier", "priority", "hires_in_india", "india_locations",
                            "domain", "company_type", "scraping_method",
                            "jobpilot_supported", "jobpilot_status")
                if self._companies_columns and c in self._companies_columns
            ]),
            mapping["id"]: f"eq.{company_id}",
            "limit": 1,
        }
        resp = self._request("GET", COMPANIES_TABLE, params=params)
        rows = resp.json()
        if not rows:
            return None
        return self._normalise_company_row(rows[0], mapping)

    # ---- runs ----

    def insert_run(self, row: dict[str, Any]) -> None:
        self._request(
            "POST",
            RUNS_TABLE,
            json_body=[_prep_row(row)],
            headers={"Prefer": "return=minimal"},
        )

    def update_run(self, run_id: UUID, patch: dict[str, Any]) -> None:
        self._request(
            "PATCH",
            RUNS_TABLE,
            params={"id": f"eq.{run_id}"},
            json_body=_prep_row(patch),
            headers={"Prefer": "return=minimal"},
        )

    def get_run(self, run_id: UUID) -> dict[str, Any] | None:
        try:
            resp = self._request(
                "GET",
                RUNS_TABLE,
                params={"select": "*", "id": f"eq.{run_id}", "limit": 1},
            )
        except PostgrestError as exc:
            if exc.status == 404:  # scrape_runs table missing
                return None
            raise
        rows = resp.json()
        return rows[0] if rows else None

    def list_runs(self, limit: int = 20) -> list[dict[str, Any]]:
        try:
            resp = self._request(
                "GET",
                RUNS_TABLE,
                params={"select": "*", "order": "started_at.desc", "limit": limit},
            )
        except PostgrestError as exc:
            if exc.status == 404:
                return []
            raise
        return resp.json()

    # ---- jobs ----

    def upsert_jobs(self, rows: list[dict[str, Any]]) -> int:
        if not rows:
            return 0
        # Chunk to keep individual requests small.
        chunk = 500
        total = 0
        for i in range(0, len(rows), chunk):
            batch = [_prep_row(r) for r in rows[i : i + chunk]]
            self._request(
                "POST",
                JOBS_TABLE,
                json_body=batch,
                headers={
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
            )
            total += len(batch)
        return total

    def count_run_jobs(self, run_id: UUID) -> int:
        try:
            resp = self._request(
                "GET",
                JOBS_TABLE,
                params={"select": "run_id", "run_id": f"eq.{run_id}", "limit": 1},
                headers={"Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"},
            )
        except PostgrestError as exc:
            if exc.status == 404:
                return 0
            raise
        content_range = resp.headers.get("content-range", "")
        if "/" in content_range:
            try:
                return int(content_range.rsplit("/", 1)[-1])
            except ValueError:
                pass
        return len(resp.json())

    def list_run_jobs(
        self, run_id: UUID, limit: int = 100, offset: int = 0
    ) -> list[dict[str, Any]]:
        params = {
            "select": "source,job_id,title,location,country,date_posted,detail_url,employment_type,hiring_org,description",
            "run_id": f"eq.{run_id}",
            "order": "date_posted.desc.nullslast,title.asc",
            "limit": limit,
            "offset": offset,
        }
        try:
            resp = self._request("GET", JOBS_TABLE, params=params)
        except PostgrestError as exc:
            if exc.status == 404:
                return []
            raise
        return resp.json()

    # ---- global jobs browse ----

    # Columns returned by the /api/jobs browse endpoint. `company_id` is
    # included so the frontend can resolve the display name against
    # /api/companies without a per-row join.
    _JOB_BROWSE_COLS = (
        "company_id,source,job_id,title,location,country,date_posted,"
        "detail_url,employment_type,hiring_org,scraped_at,description"
    )

    def _apply_job_filters(
        self,
        params: dict[str, Any],
        *,
        company_ids: Iterable[str] | None,
        sources: Iterable[str] | None,
        countries: Iterable[str] | None,
        location: str | None,
        keyword: str | None,
        employment_type: str | None,
        date_from: date | None,
        date_to: date | None,
    ) -> None:
        """Attach PostgREST filter params for the shared job-browse filters."""
        if company_ids:
            ids = ",".join(f'"{c}"' for c in company_ids)
            params["company_id"] = f"in.({ids})"
        if sources:
            srcs = ",".join(f'"{s}"' for s in sources)
            params["source"] = f"in.({srcs})"
        if countries:
            cs = ",".join(f'"{c}"' for c in countries)
            params["country"] = f"in.({cs})"
        if location:
            params["location"] = f"ilike.*{location}*"
        if keyword:
            # Match title OR description with a single PostgREST or() filter.
            safe = keyword.replace(",", " ").replace("(", " ").replace(")", " ")
            params["or"] = f"(title.ilike.*{safe}*,description.ilike.*{safe}*)"
        if employment_type:
            params["employment_type"] = f"ilike.*{employment_type}*"
        # PostgREST doesn't accept two operators on the same key in one call,
        # so we combine a range via and().
        if date_from and date_to:
            params["and"] = (
                f"(date_posted.gte.{date_from.isoformat()},"
                f"date_posted.lte.{date_to.isoformat()})"
            )
        elif date_from:
            params["date_posted"] = f"gte.{date_from.isoformat()}"
        elif date_to:
            params["date_posted"] = f"lte.{date_to.isoformat()}"

    def list_jobs(
        self,
        *,
        company_ids: Iterable[str] | None = None,
        sources: Iterable[str] | None = None,
        countries: Iterable[str] | None = None,
        location: str | None = None,
        keyword: str | None = None,
        employment_type: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 100,
        offset: int = 0,
        order: str = "date_posted.desc.nullslast",
    ) -> tuple[list[dict[str, Any]], int]:
        params: dict[str, Any] = {
            "select": self._JOB_BROWSE_COLS,
            "order": order,
            "limit": limit,
            "offset": offset,
        }
        self._apply_job_filters(
            params,
            company_ids=company_ids, sources=sources, countries=countries,
            location=location, keyword=keyword, employment_type=employment_type,
            date_from=date_from, date_to=date_to,
        )
        try:
            resp = self._request(
                "GET", JOBS_TABLE, params=params,
                headers={"Prefer": "count=exact"},
            )
        except PostgrestError as exc:
            if exc.status == 404:
                return [], 0
            raise
        rows = resp.json()
        content_range = resp.headers.get("content-range", "")
        total = 0
        if "/" in content_range:
            try:
                total = int(content_range.rsplit("/", 1)[-1])
            except ValueError:
                total = len(rows)
        return rows, total

    def distinct_job_facets(self) -> dict[str, list[str]]:
        """Return sorted distinct values for slicer dropdowns.

        PostgREST has no SELECT DISTINCT and Supabase caps a single response
        at ~1000 rows, so we paginate through the table and dedupe
        client-side. Bounded by ``MAX_ROWS`` to keep this cheap even if the
        table grows large.
        """
        empty = {"sources": [], "countries": [],
                 "employment_types": [], "company_ids": []}
        sources: set[str] = set()
        countries: set[str] = set()
        etypes: set[str] = set()
        cids: set[str] = set()

        batch = 1000
        MAX_ROWS = 200_000  # safety net: at ~1k/req that's 200 requests
        offset = 0
        while offset < MAX_ROWS:
            try:
                resp = self._request(
                    "GET", JOBS_TABLE,
                    params={
                        "select": "company_id,source,country,employment_type",
                        "limit":  batch,
                        "offset": offset,
                        # A stable order lets us walk through the whole table
                        # without duplicating pages.
                        "order":  "company_id.asc,job_id.asc",
                    },
                )
            except PostgrestError as exc:
                if exc.status == 404:
                    return empty
                raise
            rows = resp.json()
            if not rows:
                break
            for row in rows:
                if row.get("source"):
                    sources.add(str(row["source"]))
                if row.get("country"):
                    countries.add(str(row["country"]).strip())
                if row.get("employment_type"):
                    etypes.add(str(row["employment_type"]).strip())
                if row.get("company_id"):
                    cids.add(str(row["company_id"]))
            if len(rows) < batch:
                break
            offset += batch
        return {
            "sources":          sorted(sources),
            "countries":        sorted(countries),
            "employment_types": sorted(etypes),
            "company_ids":      sorted(cids),
        }

    def get_job_by_key(
        self, company_id: str, source: str, job_id: str
    ) -> dict[str, Any] | None:
        try:
            resp = self._request(
                "GET",
                JOBS_TABLE,
                params={
                    "select": "*",
                    "company_id": f"eq.{company_id}",
                    "source": f"eq.{source}",
                    "job_id": f"eq.{job_id}",
                    "limit": 1,
                },
            )
        except PostgrestError as exc:
            if exc.status == 404:
                return None
            raise
        rows = resp.json()
        return rows[0] if rows else None

    def get_job_by_url(self, url: str) -> dict[str, Any] | None:
        try:
            resp = self._request(
                "GET",
                JOBS_TABLE,
                params={
                    "select": "*",
                    "detail_url": f"eq.{url}",
                    "limit": 1,
                },
            )
        except PostgrestError as exc:
            if exc.status == 404:
                return None
            raise
        rows = resp.json()
        return rows[0] if rows else None


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


_store: Store | None = None


def build_store() -> Store:
    """Return a fresh :class:`Store` based on env vars."""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )

    if supabase_url and supabase_key:
        log.info("using SupabaseStore backend (url=%s)", supabase_url)
        return SupabaseStore(supabase_url, supabase_key)

    database_url = os.getenv("DATABASE_URL")
    if database_url:
        from .postgres_api_store import DirectPostgresStore

        log.info("using DirectPostgresStore backend (DATABASE_URL)")
        return DirectPostgresStore(database_url)

    raise RuntimeError(
        "No storage backend configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY "
        "or DATABASE_URL in your .env."
    )


def get_store() -> Store:
    global _store
    if _store is None:
        _store = build_store()
    return _store


def reset_store() -> None:
    global _store
    _store = None


__all__ = [
    "Store",
    "SupabaseStore",
    "PostgrestError",
    "build_store",
    "get_store",
    "reset_store",
    "RUNS_TABLE",
    "JOBS_TABLE",
    "COMPANIES_TABLE",
]
