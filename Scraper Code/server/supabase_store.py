"""Supabase (PostgREST) implementation of the :class:`Store` interface.

We talk to ``<SUPABASE_URL>/rest/v1/<table>`` with a service_role key. Reads
use standard PostgREST querystring filters and ordering; upserts use the
``Prefer: resolution=merge-duplicates`` header.

DDL isn't available over PostgREST, so :meth:`ensure_schema` only *verifies*
that ``scrape_runs`` and ``scraped_jobs`` exist. The user creates them once by
running :file:`db/schema.sql` in the Supabase SQL editor.
"""

from __future__ import annotations

import datetime as _dt
import json
import logging
from typing import Any
from uuid import UUID

import requests

from src.models import JobDetail

from .store import SchemaError

log = logging.getLogger(__name__)

REST_PATH = "/rest/v1"


def _iso(value: Any) -> Any:
    """Return a JSON-safe representation of ``value``."""
    if value is None:
        return None
    if isinstance(value, (_dt.datetime, _dt.date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    return value


def _row_to_json(row: dict[str, Any]) -> dict[str, Any]:
    return {k: _iso(v) for k, v in row.items()}


class SupabaseStore:
    backend_name = "supabase"

    def __init__(self, url: str, key: str, *, timeout: float = 30.0) -> None:
        self.base_url = url.rstrip("/")
        self._key = key
        self._timeout = timeout
        self._session = requests.Session()
        self._session.headers.update(
            {
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Accept-Profile": "public",
            }
        )

    # ---------------------- low-level HTTP ----------------------

    def _url(self, path: str) -> str:
        return f"{self.base_url}{REST_PATH}{path}"

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: Any = None,
        headers: dict[str, str] | None = None,
    ) -> requests.Response:
        merged_headers = dict(headers or {})
        response = self._session.request(
            method,
            self._url(path),
            params=params,
            data=json.dumps(json_body) if json_body is not None else None,
            headers=merged_headers,
            timeout=self._timeout,
        )
        if response.status_code >= 400:
            snippet = (response.text or "")[:400]
            raise RuntimeError(
                f"Supabase {method} {path} failed: HTTP {response.status_code} {snippet}"
            )
        return response

    # ---------------------- lifecycle ----------------------

    def ping(self) -> tuple[bool, str]:
        # Reading a single companies row is a much better signal than pinging
        # the OpenAPI meta endpoint (which requires elevated permissions).
        try:
            resp = self._session.get(
                self._url("/companies"),
                params={"select": "id", "limit": 1},
                timeout=self._timeout,
            )
            if resp.status_code < 400:
                return True, "connected"
            return False, f"HTTP {resp.status_code}: {(resp.text or '')[:200]}"
        except requests.RequestException as exc:
            return False, str(exc)

    def ensure_schema(self) -> None:
        missing: list[str] = []
        for table in ("scrape_runs", "scraped_jobs"):
            try:
                self._request("GET", f"/{table}", params={"select": "id" if table == "scrape_runs" else "run_id", "limit": 1})
            except RuntimeError as exc:
                if "PGRST205" in str(exc) or "404" in str(exc) or "42P01" in str(exc):
                    missing.append(table)
                else:
                    raise
        if missing:
            raise SchemaError(
                "Required tables missing: "
                + ", ".join(missing)
                + ". Run db/schema.sql in the Supabase SQL editor to create them."
            )

    def close(self) -> None:
        self._session.close()

    # ---------------------- companies ----------------------

    def companies_columns(self) -> list[str]:
        # Fetch one row with select=*; if the table has any rows the returned
        # dict's keys are the column names. Falls back to an empty list.
        resp = self._request("GET", "/companies", params={"select": "*", "limit": 1})
        rows = resp.json() or []
        if rows and isinstance(rows[0], dict):
            return list(rows[0].keys())
        return []

    def list_companies_raw(self) -> list[dict[str, Any]]:
        # Supabase caps PostgREST responses at 1000 rows by default. Paginate
        # via Range header until we get a short page.
        rows: list[dict[str, Any]] = []
        page_size = 1000
        offset = 0
        while True:
            resp = self._request(
                "GET",
                "/companies",
                params={"select": "*"},
                headers={"Range-Unit": "items", "Range": f"{offset}-{offset + page_size - 1}"},
            )
            batch = resp.json() or []
            rows.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
        return rows

    # ---------------------- runs ----------------------

    def insert_run(self, run: dict[str, Any]) -> None:
        self._request(
            "POST",
            "/scrape_runs",
            json_body=[_row_to_json(run)],
            headers={"Prefer": "return=minimal"},
        )

    def update_run(self, run_id: UUID, fields: dict[str, Any]) -> None:
        self._request(
            "PATCH",
            "/scrape_runs",
            params={"id": f"eq.{run_id}"},
            json_body=_row_to_json(fields),
            headers={"Prefer": "return=minimal"},
        )

    def get_run(self, run_id: UUID) -> dict[str, Any] | None:
        resp = self._request(
            "GET", "/scrape_runs", params={"id": f"eq.{run_id}", "select": "*", "limit": 1}
        )
        rows = resp.json() or []
        return rows[0] if rows else None

    def list_runs(self, limit: int = 20) -> list[dict[str, Any]]:
        resp = self._request(
            "GET",
            "/scrape_runs",
            params={"select": "*", "order": "started_at.desc", "limit": limit},
        )
        return resp.json() or []

    # ---------------------- jobs ----------------------

    def upsert_jobs(
        self, *, run_id: UUID, company_id: str, jobs: list[JobDetail]
    ) -> int:
        payload: list[dict[str, Any]] = []
        for job in jobs:
            if not (job.job_id and job.title and job.detail_url):
                continue
            payload.append(
                _row_to_json(
                    {
                        "run_id": run_id,
                        "company_id": company_id,
                        "source": job.source,
                        "job_id": job.job_id,
                        "title": job.title,
                        "location": job.location,
                        "country": job.country,
                        "date_posted": job.date_posted,
                        "detail_url": job.detail_url,
                        "employment_type": job.employment_type,
                        "hiring_org": job.hiring_org,
                        "description": job.description,
                    }
                )
            )
        if not payload:
            return 0

        # PostgREST batches: send in chunks of 500 to stay well under limits.
        chunk = 500
        written = 0
        for i in range(0, len(payload), chunk):
            self._request(
                "POST",
                "/scraped_jobs",
                json_body=payload[i : i + chunk],
                headers={
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
            )
            written += min(chunk, len(payload) - i)
        return written

    def list_run_jobs(
        self, run_id: UUID, *, limit: int = 100, offset: int = 0
    ) -> tuple[int, list[dict[str, Any]]]:
        resp = self._request(
            "GET",
            "/scraped_jobs",
            params={
                "run_id": f"eq.{run_id}",
                "select": "source,job_id,title,location,country,date_posted,"
                "detail_url,employment_type,hiring_org,description",
                "order": "date_posted.desc.nullslast,title.asc",
                "limit": limit,
                "offset": offset,
            },
            headers={"Prefer": "count=exact"},
        )
        # Content-Range: "0-24/930"
        total = 0
        content_range = resp.headers.get("Content-Range")
        if content_range and "/" in content_range:
            tail = content_range.rsplit("/", 1)[-1]
            if tail.isdigit():
                total = int(tail)
        return total, resp.json() or []


__all__ = ["SupabaseStore"]
