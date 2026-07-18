"""PostgreSQL layer.

The schema is now platform-neutral: the ``jobs`` table has a composite key of
``(source, job_id)`` so several ATS platforms can coexist in one database
without collisions.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Iterable
from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg import Connection

from .models import JobDetail

log = logging.getLogger(__name__)

TABLE = "jobs"

SCHEMA_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE} (
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
    PRIMARY KEY (source, job_id)
);
CREATE INDEX IF NOT EXISTS {TABLE}_source_date_idx
    ON {TABLE} (source, date_posted DESC);
CREATE INDEX IF NOT EXISTS {TABLE}_date_idx
    ON {TABLE} (date_posted DESC);
"""

UPSERT_SQL = f"""
INSERT INTO {TABLE} (
    source, job_id, title, location, country, date_posted,
    detail_url, employment_type, hiring_org, description
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (source, job_id) DO UPDATE SET
    title           = EXCLUDED.title,
    location        = EXCLUDED.location,
    country         = EXCLUDED.country,
    date_posted     = EXCLUDED.date_posted,
    detail_url      = EXCLUDED.detail_url,
    employment_type = EXCLUDED.employment_type,
    hiring_org      = EXCLUDED.hiring_org,
    description     = EXCLUDED.description,
    scraped_at      = NOW();
"""


def _conninfo() -> str:
    url = os.getenv("DATABASE_URL")
    if url:
        return url

    parts = []
    for env_var, key in (
        ("PGHOST", "host"),
        ("PGPORT", "port"),
        ("PGUSER", "user"),
        ("PGPASSWORD", "password"),
        ("PGDATABASE", "dbname"),
    ):
        value = os.getenv(env_var)
        if value:
            parts.append(f"{key}={value}")
    return " ".join(parts)


@contextmanager
def get_conn() -> Iterator[Connection]:
    """Yield a psycopg connection. Commits on success, rolls back on error."""
    conninfo = _conninfo()
    if not conninfo:
        raise RuntimeError(
            "No PostgreSQL connection configured. Set DATABASE_URL or PGHOST/PGUSER/PGDATABASE."
        )
    conn = psycopg.connect(conninfo)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ensure_schema(conn: Connection) -> None:
    """Create the ``jobs`` table and indexes if they don't already exist."""
    with conn.cursor() as cur:
        cur.execute(SCHEMA_SQL)


def _row(job: JobDetail) -> tuple:
    return (
        job.source or "unknown",
        job.job_id,
        job.title,
        job.location,
        job.country,
        job.date_posted,
        job.detail_url,
        job.employment_type,
        job.hiring_org,
        job.description,
    )


def upsert_jobs(conn: Connection, jobs: Iterable[JobDetail]) -> int:
    """Insert or update the given jobs. Returns the number of rows written."""
    rows = [_row(j) for j in jobs if j.job_id and j.title and j.detail_url]
    if not rows:
        return 0
    with conn.cursor() as cur:
        cur.executemany(UPSERT_SQL, rows)
    log.info("Upserted %d job(s) into %s", len(rows), TABLE)
    return len(rows)


__all__ = ["get_conn", "ensure_schema", "upsert_jobs", "SCHEMA_SQL", "UPSERT_SQL", "TABLE"]
