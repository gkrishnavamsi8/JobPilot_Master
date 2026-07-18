-- Run this once in the Supabase SQL editor (or via psql) to create the tables
-- the jobpilot API writes to. Idempotent - safe to re-run.
--
--   Dashboard -> SQL editor -> New query -> paste this file -> Run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.scrape_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      TEXT NOT NULL,
    company_name    TEXT,
    platform        TEXT NOT NULL,
    filters         JSONB NOT NULL DEFAULT '{}'::jsonb,
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

CREATE INDEX IF NOT EXISTS scrape_runs_company_idx
    ON public.scrape_runs (company_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.scraped_jobs (
    run_id          UUID NOT NULL REFERENCES public.scrape_runs(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS scraped_jobs_run_idx
    ON public.scraped_jobs (run_id);

CREATE INDEX IF NOT EXISTS scraped_jobs_company_date_idx
    ON public.scraped_jobs (company_id, date_posted DESC);

-- Supabase-specific: expose the new tables to PostgREST for the service_role
-- (writes) and anon (read-only). Adjust or drop these grants to taste.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_runs  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scraped_jobs TO service_role;
GRANT SELECT                           ON public.scrape_runs  TO anon, authenticated;
GRANT SELECT                           ON public.scraped_jobs TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Jobpilot annotations on the existing companies table.
--
-- Two new columns encode "can this row be scraped today?" so you can filter
-- in SQL / the UI without recomputing on every request:
--
--   jobpilot_supported  BOOLEAN  - true when the platform maps to a plugin
--                                 currently registered in src.ats.
--   jobpilot_status     TEXT     - short human-readable reason
--                                 (e.g. "workday plugin", "no plugin: phenompeople").
--
-- Both are populated by scripts/mark_supported.py after this DDL runs.
-- Everything is idempotent - safe to re-run.
-- ---------------------------------------------------------------------------

ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS jobpilot_supported BOOLEAN,
    ADD COLUMN IF NOT EXISTS jobpilot_status    TEXT;

CREATE INDEX IF NOT EXISTS companies_jobpilot_supported_idx
    ON public.companies (jobpilot_supported);
