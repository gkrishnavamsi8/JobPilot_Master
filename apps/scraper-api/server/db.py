"""Compatibility shim.

Historically this module owned a psycopg connection pool. The API now writes
to Supabase over PostgREST (see :mod:`server.store`); this file just re-exports
the store factory + table names so older imports keep working.
"""

from __future__ import annotations

from .store import (
    COMPANIES_TABLE,
    JOBS_TABLE,
    RUNS_TABLE,
    Store,
    build_store,
    get_store,
    reset_store,
)


def ensure_schema() -> None:
    """No-op on the PostgREST backend.

    Supabase can't run DDL over PostgREST; run ``db/schema.sql`` once in the
    Supabase SQL editor to create ``scrape_runs`` and ``scraped_jobs`` before
    starting the API.
    """
    # A cheap round-trip so misconfigurations are surfaced at startup.
    get_store().health()


__all__ = [
    "COMPANIES_TABLE",
    "JOBS_TABLE",
    "RUNS_TABLE",
    "Store",
    "build_store",
    "get_store",
    "reset_store",
    "ensure_schema",
]
