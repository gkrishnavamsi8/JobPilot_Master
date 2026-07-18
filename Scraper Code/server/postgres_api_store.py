"""Direct Postgres implementation of :class:`server.store.Store`.

Used when ``DATABASE_URL`` is set but Supabase REST credentials are not.
"""

from __future__ import annotations

import logging
import os
from datetime import date
from typing import Any, Iterable
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json
from psycopg_pool import ConnectionPool

from .store import COMPANIES_TABLE, JOBS_TABLE, RUNS_TABLE, Store

log = logging.getLogger(__name__)

_ID_ALIASES = ("id", "company_id", "uuid", "slug")
_NAME_ALIASES = ("company_name", "name", "title", "display_name")
_URL_ALIASES = (
    "official_careers_url", "careers_url", "career_url", "careers_page",
    "careers_page_url", "career_page_url", "careers", "jobs_url",
    "job_board_url", "portal_url", "website", "site", "url", "domain",
)
_PLATFORM_ALIASES = ("ats_platform", "platform", "ats", "ats_provider", "provider", "system")
_ACTIVE_ALIASES = ("is_active", "active", "enabled")

_JOB_BROWSE_COLS = (
    "company_id", "source", "job_id", "title", "location", "country",
    "date_posted", "detail_url", "employment_type", "hiring_org",
    "scraped_at", "description",
)


def normalize_conninfo(url: str) -> str:
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    parsed = urlparse(url)
    if parsed.query:
        params = parse_qs(parsed.query, keep_blank_values=True)
        params.pop("pgbouncer", None)
        if "supabase.com" in url and "sslmode" not in params:
            params["sslmode"] = ["require"]
        query = urlencode(params, doseq=True)
        url = urlunparse(parsed._replace(query=query))
    elif "supabase.com" in url:
        url = f"{url}?sslmode=require"

    return url


class DirectPostgresStore(Store):
    kind = "postgres"

    def __init__(self, conninfo: str) -> None:
        self._conninfo = normalize_conninfo(conninfo)
        pool_max = int(os.getenv("DB_POOL_MAX", "5"))
        kwargs: dict[str, Any] = {"application_name": "jobpilot-api"}
        if ":6543/" in self._conninfo or "pooler.supabase.com" in self._conninfo:
            kwargs["prepare_threshold"] = None
        self._pool = ConnectionPool(
            self._conninfo,
            min_size=1,
            max_size=pool_max,
            kwargs=kwargs,
            open=True,
        )
        self._company_mapping: dict[str, str | None] | None = None
        self._companies_columns: list[str] | None = None

    def _table_exists(self, table: str) -> bool:
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = %s
                )
                """,
                (table,),
            )
            return bool(cur.fetchone()[0])

    def health(self) -> dict[str, Any]:
        try:
            with self._pool.connection() as conn, conn.cursor() as cur:
                cur.execute("SELECT 1")
        except Exception as exc:  # noqa: BLE001
            return {
                "database": "postgres",
                "reachable": False,
                "error": str(exc),
                "companies_table": "error",
                "scrape_runs_table": "error",
                "scraped_jobs_table": "error",
            }

        def status(table: str) -> str:
            return "ok" if self._table_exists(table) else "missing"

        return {
            "database": "postgres",
            "reachable": True,
            "companies_table": status(COMPANIES_TABLE),
            "scrape_runs_table": status(RUNS_TABLE),
            "scraped_jobs_table": status(JOBS_TABLE),
        }

    def _detect_columns(self) -> dict[str, str | None]:
        if self._company_mapping is not None:
            return self._company_mapping

        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
                ORDER BY ordinal_position
                """,
                (COMPANIES_TABLE,),
            )
            columns = [r[0] for r in cur.fetchall()]

        self._companies_columns = columns
        lower = {c.lower(): c for c in columns}

        def pick(aliases: tuple[str, ...]) -> str | None:
            for alias in aliases:
                if alias in lower:
                    return lower[alias]
            return None

        mapping = {
            "id": pick(_ID_ALIASES),
            "name": pick(_NAME_ALIASES),
            "url": pick(_URL_ALIASES),
            "platform": pick(_PLATFORM_ALIASES),
            "active": pick(_ACTIVE_ALIASES),
        }
        self._company_mapping = mapping
        return mapping

    def companies_mapping(self) -> dict[str, str | None]:
        return dict(self._detect_columns())

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
                if k not in {
                    mapping["id"], mapping["name"], mapping["url"],
                    mapping["platform"], mapping["active"],
                }
            },
        }

    def list_companies(
        self,
        *,
        query: str | None = None,
        platform: str | None = None,
        include_inactive: bool = False,
    ) -> list[dict[str, Any]]:
        if not self._table_exists(COMPANIES_TABLE):
            return []

        mapping = self._detect_columns()
        if not mapping["id"] or not mapping["name"]:
            return []

        cols = self._companies_columns or []
        select_cols = [
            c for c in {
                mapping["id"], mapping["name"], mapping["url"], mapping["platform"], mapping["active"],
            } if c and c in cols
        ]
        where: list[str] = []
        params: list[Any] = []
        if not include_inactive and mapping["active"]:
            where.append(f'"{mapping["active"]}" = true')
        if query and mapping["name"]:
            where.append(f'"{mapping["name"]}" ILIKE %s')
            params.append(f"%{query}%")

        sql = f'SELECT {", ".join(f'"{c}"' for c in select_cols)} FROM {COMPANIES_TABLE}'
        if where:
            sql += " WHERE " + " AND ".join(where)
        if mapping["name"]:
            sql += f' ORDER BY "{mapping["name"]}" ASC'

        with self._pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
        return [self._normalise_company_row(dict(r), mapping) for r in rows]

    def get_company(self, company_id: str) -> dict[str, Any] | None:
        if not self._table_exists(COMPANIES_TABLE):
            return None
        mapping = self._detect_columns()
        if not mapping["id"]:
            return None
        with self._pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f'SELECT * FROM {COMPANIES_TABLE} WHERE "{mapping["id"]}" = %s LIMIT 1',
                (company_id,),
            )
            row = cur.fetchone()
        if row is None:
            return None
        return self._normalise_company_row(dict(row), mapping)

    def insert_run(self, row: dict[str, Any]) -> None:
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {RUNS_TABLE}
                    (id, company_id, company_name, platform, filters, status, started_at)
                VALUES (%(id)s, %(company_id)s, %(company_name)s, %(platform)s, %(filters)s, %(status)s, %(started_at)s)
                """,
                {
                    "id": row["id"],
                    "company_id": row["company_id"],
                    "company_name": row.get("company_name"),
                    "platform": row["platform"],
                    "filters": Json(row.get("filters") or {}),
                    "status": row.get("status", "running"),
                    "started_at": row.get("started_at"),
                },
            )
            conn.commit()

    def update_run(self, run_id: UUID, patch: dict[str, Any]) -> None:
        if not patch:
            return
        set_parts = ", ".join(f"{k} = %({k})s" for k in patch)
        params = dict(patch)
        params["id"] = run_id
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(f"UPDATE {RUNS_TABLE} SET {set_parts} WHERE id = %(id)s", params)
            conn.commit()

    def upsert_jobs(self, rows: list[dict[str, Any]]) -> int:
        if not rows:
            return 0
        with self._pool.connection() as conn, conn.cursor() as cur:
            for row in rows:
                cur.execute(
                    f"""
                    INSERT INTO {JOBS_TABLE} (
                        run_id, company_id, source, job_id, title, location, country,
                        date_posted, detail_url, employment_type, hiring_org, description
                    ) VALUES (
                        %(run_id)s, %(company_id)s, %(source)s, %(job_id)s, %(title)s,
                        %(location)s, %(country)s, %(date_posted)s, %(detail_url)s,
                        %(employment_type)s, %(hiring_org)s, %(description)s
                    )
                    ON CONFLICT (company_id, source, job_id) DO UPDATE SET
                        run_id = EXCLUDED.run_id,
                        title = EXCLUDED.title,
                        location = EXCLUDED.location,
                        country = EXCLUDED.country,
                        date_posted = EXCLUDED.date_posted,
                        detail_url = EXCLUDED.detail_url,
                        employment_type = EXCLUDED.employment_type,
                        hiring_org = EXCLUDED.hiring_org,
                        description = EXCLUDED.description,
                        scraped_at = NOW()
                    """,
                    row,
                )
            conn.commit()
        return len(rows)

    def get_run(self, run_id: UUID) -> dict[str, Any] | None:
        with self._pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(f"SELECT * FROM {RUNS_TABLE} WHERE id = %s", (run_id,))
            row = cur.fetchone()
        return dict(row) if row else None

    def list_runs(self, limit: int = 20) -> list[dict[str, Any]]:
        with self._pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"SELECT * FROM {RUNS_TABLE} ORDER BY started_at DESC LIMIT %s",
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]

    def count_run_jobs(self, run_id: UUID) -> int:
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM {JOBS_TABLE} WHERE run_id = %s", (run_id,))
            return int(cur.fetchone()[0])

    def list_run_jobs(
        self, run_id: UUID, limit: int = 100, offset: int = 0
    ) -> list[dict[str, Any]]:
        with self._pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"""
                SELECT source, job_id, title, location, country, date_posted, detail_url,
                       employment_type, hiring_org, description
                FROM {JOBS_TABLE}
                WHERE run_id = %s
                ORDER BY date_posted DESC NULLS LAST, title ASC
                LIMIT %s OFFSET %s
                """,
                (run_id, limit, offset),
            )
            return [dict(r) for r in cur.fetchall()]

    def _job_filter_sql(
        self,
        *,
        company_ids: Iterable[str] | None,
        sources: Iterable[str] | None,
        countries: Iterable[str] | None,
        location: str | None,
        keyword: str | None,
        employment_type: str | None,
        date_from: date | None,
        date_to: date | None,
    ) -> tuple[str, list[Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if company_ids:
            clauses.append("company_id = ANY(%s)")
            params.append(list(company_ids))
        if sources:
            clauses.append("source = ANY(%s)")
            params.append(list(sources))
        if countries:
            clauses.append("country = ANY(%s)")
            params.append(list(countries))
        if location:
            clauses.append("location ILIKE %s")
            params.append(f"%{location}%")
        if keyword:
            clauses.append("(title ILIKE %s OR description ILIKE %s)")
            safe = f"%{keyword}%"
            params.extend([safe, safe])
        if employment_type:
            clauses.append("employment_type ILIKE %s")
            params.append(f"%{employment_type}%")
        if date_from:
            clauses.append("date_posted >= %s")
            params.append(date_from)
        if date_to:
            clauses.append("date_posted <= %s")
            params.append(date_to)
        if not clauses:
            return "", params
        return " WHERE " + " AND ".join(clauses), params

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
        if not self._table_exists(JOBS_TABLE):
            return [], 0

        where_sql, params = self._job_filter_sql(
            company_ids=company_ids,
            sources=sources,
            countries=countries,
            location=location,
            keyword=keyword,
            employment_type=employment_type,
            date_from=date_from,
            date_to=date_to,
        )
        order_sql = "date_posted DESC NULLS LAST, title ASC"

        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT COUNT(*) FROM {JOBS_TABLE}{where_sql}", params)
                total = int(cur.fetchone()[0])
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    f"""
                    SELECT {", ".join(_JOB_BROWSE_COLS)}
                    FROM {JOBS_TABLE}
                    {where_sql}
                    ORDER BY {order_sql}
                    LIMIT %s OFFSET %s
                    """,
                    [*params, limit, offset],
                )
                rows = [dict(r) for r in cur.fetchall()]
        return rows, total

    def distinct_job_facets(self) -> dict[str, list[str]]:
        if not self._table_exists(JOBS_TABLE):
            return {"sources": [], "countries": [], "employment_types": [], "company_ids": []}

        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT DISTINCT source, country, employment_type, company_id
                FROM {JOBS_TABLE}
                """
            )
            rows = cur.fetchall()

        sources: set[str] = set()
        countries: set[str] = set()
        etypes: set[str] = set()
        cids: set[str] = set()
        for source, country, employment_type, company_id in rows:
            if source:
                sources.add(str(source))
            if country:
                countries.add(str(country).strip())
            if employment_type:
                etypes.add(str(employment_type).strip())
            if company_id:
                cids.add(str(company_id))

        return {
            "sources": sorted(sources),
            "countries": sorted(countries),
            "employment_types": sorted(etypes),
            "company_ids": sorted(cids),
        }

    def get_job_by_key(
        self, company_id: str, source: str, job_id: str
    ) -> dict[str, Any] | None:
        with self._pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"""
                SELECT * FROM {JOBS_TABLE}
                WHERE company_id = %s AND source = %s AND job_id = %s
                LIMIT 1
                """,
                (company_id, source, job_id),
            )
            row = cur.fetchone()
        return dict(row) if row else None

    def get_job_by_url(self, url: str) -> dict[str, Any] | None:
        with self._pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"SELECT * FROM {JOBS_TABLE} WHERE detail_url = %s LIMIT 1",
                (url,),
            )
            row = cur.fetchone()
        return dict(row) if row else None


__all__ = ["DirectPostgresStore", "normalize_conninfo"]
