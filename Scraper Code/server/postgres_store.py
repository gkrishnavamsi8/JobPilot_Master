"""Direct-Postgres implementation of the :class:`Store` interface.

This is the fallback backend used when ``DATABASE_URL`` is set but Supabase
credentials are not. All SQL lives in this module so the rest of the app never
has to know which backend is active.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Json
from psycopg_pool import ConnectionPool

from src.models import JobDetail

log = logging.getLogger(__name__)

RUNS_TABLE = "scrape_runs"
JOBS_TABLE = "scraped_jobs"

_SCHEMA_SQL = f"""
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS {RUNS_TABLE} (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      TEXT NOT NULL,
    company_name    TEXT,
    platform        TEXT NOT NULL,
    filters         JSONB NOT NULL DEFAULT '{{}}'::jsonb,
    status          TEXT NOT NULL,
    stubs_seen      INT  NOT NULL DEFAULT 0,
    details_fetched INT  NOT NULL DEFAULT 0,
    matched         INT  NOT NULL DEFAULT 0,
    errors          INT  NOT NULL DEFAULT 0,
    total_pages     INT  NOT NULL DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS {RUNS_TABLE}_company_idx ON {RUNS_TABLE} (company_id, started_at DESC);

CREATE TABLE IF NOT EXISTS {JOBS_TABLE} (
    run_id          UUID NOT NULL REFERENCES {RUNS_TABLE}(id) ON DELETE CASCADE,
    company_id      TEXT NOT NULL,
    source          TEXT NOT NULL,
    job_id          TEXT NOT NULL,
    title           TEXT NOT NULL,
    location        TEXT,
    country         TEXT,
    date_posted     DATE,
    detail_url      TEXT NOT NULL,
    employment_type TEXT,
    hiring_org      TEXT,
    description     TEXT,
    scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, source, job_id)
);
CREATE INDEX IF NOT EXISTS {JOBS_TABLE}_run_idx ON {JOBS_TABLE} (run_id);
CREATE INDEX IF NOT EXISTS {JOBS_TABLE}_company_date_idx
    ON {JOBS_TABLE} (company_id, date_posted DESC);
"""


class PostgresStore:
    backend_name = "postgres"

    def __init__(self, conninfo: str, *, pool_max: int = 5) -> None:
        self._pool = ConnectionPool(
            conninfo,
            min_size=1,
            max_size=pool_max,
            kwargs={"application_name": "jobpilot-api"},
            open=True,
        )

    def close(self) -> None:
        self._pool.close()

    # ---------------------- lifecycle ----------------------

    def ping(self) -> tuple[bool, str]:
        try:
            with self._pool.connection() as conn, conn.cursor() as cur:
                cur.execute("SELECT 1")
                return True, "connected"
        except Exception as exc:  # noqa: BLE001
            return False, str(exc)

    def ensure_schema(self) -> None:
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(_SCHEMA_SQL)
            conn.commit()

    # ---------------------- companies ----------------------

    def companies_columns(self) -> list[str]:
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'companies'
                ORDER BY ordinal_position
                """
            )
            return [r[0] for r in cur.fetchall()]

    def list_companies_raw(self) -> list[dict[str, Any]]:
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM companies")
            cols = [d.name for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

    # ---------------------- runs ----------------------

    def insert_run(self, run: dict[str, Any]) -> None:
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {RUNS_TABLE} (id, company_id, company_name, platform, filters, status, started_at)
                VALUES (%(id)s, %(company_id)s, %(company_name)s, %(platform)s, %(filters)s, %(status)s, %(started_at)s)
                """,
                {
                    "id": run["id"],
                    "company_id": run["company_id"],
                    "company_name": run.get("company_name"),
                    "platform": run["platform"],
                    "filters": Json(run.get("filters") or {}),
                    "status": run.get("status", "running"),
                    "started_at": run.get("started_at"),
                },
            )
            conn.commit()

    def update_run(self, run_id: UUID, fields: dict[str, Any]) -> None:
        if not fields:
            return
        set_parts = ", ".join(f"{k} = %({k})s" for k in fields)
        params = dict(fields)
        params["id"] = run_id
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                f"UPDATE {RUNS_TABLE} SET {set_parts} WHERE id = %(id)s", params
            )
            conn.commit()

    def get_run(self, run_id: UUID) -> dict[str, Any] | None:
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT * FROM {RUNS_TABLE} WHERE id = %s", (run_id,))
            row = cur.fetchone()
            if row is None:
                return None
            cols = [d.name for d in cur.description]
            return dict(zip(cols, row))

    def list_runs(self, limit: int = 20) -> list[dict[str, Any]]:
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                f"SELECT * FROM {RUNS_TABLE} ORDER BY started_at DESC LIMIT %s",
                (limit,),
            )
            cols = [d.name for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

    # ---------------------- jobs ----------------------

    def upsert_jobs(
        self, *, run_id: UUID, company_id: str, jobs: list[JobDetail]
    ) -> int:
        rows = [
            (
                run_id,
                company_id,
                j.source,
                j.job_id,
                j.title,
                j.location,
                j.country,
                j.date_posted,
                j.detail_url,
                j.employment_type,
                j.hiring_org,
                j.description,
            )
            for j in jobs
            if j.job_id and j.title and j.detail_url
        ]
        if not rows:
            return 0
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.executemany(
                f"""
                INSERT INTO {JOBS_TABLE} (
                    run_id, company_id, source, job_id, title, location, country,
                    date_posted, detail_url, employment_type, hiring_org, description
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                    scraped_at = NOW();
                """,
                rows,
            )
            conn.commit()
        return len(rows)

    def list_run_jobs(
        self, run_id: UUID, *, limit: int = 100, offset: int = 0
    ) -> tuple[int, list[dict[str, Any]]]:
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM {JOBS_TABLE} WHERE run_id = %s", (run_id,))
            total = int(cur.fetchone()[0])

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
            cols = [d.name for d in cur.description]
            rows = [dict(zip(cols, row)) for row in cur.fetchall()]
            return total, rows


__all__ = ["PostgresStore"]
