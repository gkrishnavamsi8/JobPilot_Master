# jobpilot

A pluggable Python scraper for career/ATS portals. Each portal is a small
`BaseAtsScraper` plugin under `src/ats/`; the CLI shares a common set of
filters and writes results to Postgres and/or Excel.

## Supported platforms (out of the box)

| `--platform`  | Portal                                                 | How discovery works                                  |
| ------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| `astrazeneca` | [careers.astrazeneca.com](https://careers.astrazeneca.com/search-jobs) (TalentBrew-hosted) | Server-rendered HTML, paginates via `?p=N`         |
| `workday`     | Any Workday-hosted site (config-driven; see below)     | Workday CXS API (`POST /wday/cxs/<tenant>/<site>/jobs`) |

Run `python -m src.main --list-platforms` to see everything currently
registered.

## Fields captured

| Column            | Populated by                                                              |
| ----------------- | ------------------------------------------------------------------------- |
| `source`          | Plugin name (`astrazeneca`, `workday`, ...)                               |
| `job_id`          | Listing card id / API job requisition id                                  |
| `title`           | Site title                                                                |
| `location`        | Full location string (city, region, country) from JSON-LD / Workday API   |
| `country`         | Best-effort country extracted from location                               |
| `date_posted`     | JSON-LD `datePosted` (AstraZeneca) / Workday `postedOn`                   |
| `detail_url`      | Absolute URL to the job detail page                                       |
| `employment_type` | Full time / Part time / ...                                               |
| `hiring_org`      | JSON-LD `hiringOrganization.name` (AstraZeneca) / Workday `company`       |
| `description`     | Long description, HTML stripped                                           |
| `scraped_at`      | `NOW()` at write time                                                     |

## Web UI (FastAPI + React)

There is a small web app in [server/](server/) (FastAPI) and [web/](web/)
(Vite + React + TypeScript) that lets you pick a company from your Supabase
`companies` table, run its matching scraper with filters, and browse or
download the results. It reuses the same plugin registry as the CLI.

### Setup

```bash
# 1. Python side
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# 2. Node side
cd web && npm install && cd ..
```

Then edit `.env` to pick a storage backend. Two options:

**Option A: Supabase (recommended)** - uses the REST/PostgREST API, so the DB
password never leaves the Supabase dashboard. Get both values from
Supabase Dashboard -> Project Settings -> API.

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...   # or an eyJ... service_role JWT
```

The service_role key bypasses RLS and can INSERT/UPDATE, which the scrape
runner needs. Anon / publishable keys can only *read* unless RLS policies are
opened up. Never share the service_role key publicly.

**Option B: Direct Postgres** - CLI-style connection.

```
DATABASE_URL=postgresql://postgres:<PASSWORD>@db.<ref>.supabase.co:5432/postgres?sslmode=require
```

### One-time table setup

Whichever backend you choose, the API needs two new tables (`scrape_runs`,
`scraped_jobs`). With **Postgres** the API creates them automatically on
startup. With **Supabase** (PostgREST), DDL isn't available over REST - open
Supabase Dashboard -> SQL editor -> New query, paste
[db/schema.sql](db/schema.sql) and Run once.

### Run

Two terminals for local dev:

```bash
# Terminal 1 - API on :8000
.venv/bin/uvicorn server.main:app --reload --port 8000

# Terminal 2 - UI on :5173 (proxies /api -> :8000)
cd web && npm run dev
```

Open http://localhost:5173. The header shows DB status and whether the
`companies` table was successfully introspected.

### How the companies table is read

The server inspects `information_schema.columns` for your `companies` table
and picks the best-matching column for each logical field:

| Logical field | Column aliases tried (case-insensitive)                     |
| ------------- | ------------------------------------------------------------ |
| id            | `id`, `company_id`, `uuid`, `slug`                          |
| name          | `name`, `company_name`, `company`, `title`, `display_name`  |
| careers URL   | `careers_url`, `career_url`, `careers_page`, `careers_page_url`, `career_page_url`, `careers`, `jobs_url`, `job_board_url`, `portal_url`, `website`, `site`, `url` |
| platform      | `platform`, `ats`, `ats_platform`, `ats_provider`, `provider`, `system` (optional) |

If your table doesn't have a `platform` column, the server infers it from the
careers URL host (`*.myworkdayjobs.com` -> `workday`,
`careers.astrazeneca.com` -> `astrazeneca`, etc.). Unrecognised hosts show
in the UI with a grey "unknown" badge and the Run button stays disabled.

### New tables created by the API

On first request the API runs `CREATE TABLE IF NOT EXISTS`:

- `scrape_runs` - one row per scrape (status, counters, filters JSONB).
- `scraped_jobs` - job rows keyed by `(company_id, source, job_id)`, linked
  to `scrape_runs.id` via a foreign key.

The older CLI-managed `jobs` table is untouched; UI and CLI can coexist.

### API endpoints

- `GET  /api/health`                         DB ping + companies introspection status
- `GET  /api/platforms`                      registered scraper plugins
- `GET  /api/companies?q=&platform=`         list companies with detected platform
- `POST /api/scrape`                         start a scrape (body: `{company_id, filters}`)
- `GET  /api/runs?limit=`                    recent runs
- `GET  /api/runs/{run_id}`                  live status of one run
- `GET  /api/runs/{run_id}/jobs?limit=&offset=` paginated matched jobs
- `GET  /api/runs/{run_id}/export.xlsx`      download the run's jobs as .xlsx

Interactive docs at http://localhost:8000/docs.

---

## Install (CLI only)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then edit as needed
```

## Configuration

| Variable                     | Default            | Purpose                                                       |
| ---------------------------- | ------------------ | ------------------------------------------------------------- |
| `PLATFORM`                   | `astrazeneca`      | Default `--platform` when the flag is omitted                 |
| `DATABASE_URL`               | -                  | Full Postgres URL, e.g. `postgresql://user:pw@host/db`        |
| `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` | libpq defaults | Used if `DATABASE_URL` is empty                     |
| `SCRAPE_TZ`                  | `UTC`              | IANA TZ used to compute "today"                               |
| `MAX_WORKERS`                | `8`                | Concurrent detail fetches                                     |
| `SCRAPER_USER_AGENT`         | jobpilot default   | Outgoing User-Agent                                           |
| `WORKDAY_BASE_URL`           | -                  | Full Workday URL up to the site slug (see below)              |
| `WORKDAY_HOST`/`WORKDAY_TENANT`/`WORKDAY_LOCALE`/`WORKDAY_SITE` | - | Alternative to `WORKDAY_BASE_URL`               |

### Workday configuration

Point the `workday` scraper at any employer's Workday portal by setting
`WORKDAY_BASE_URL`, e.g.

```env
WORKDAY_BASE_URL=https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite
```

or the discrete parts:

```env
WORKDAY_HOST=nvidia.wd5.myworkdayjobs.com
WORKDAY_TENANT=nvidia
WORKDAY_LOCALE=en-US
WORKDAY_SITE=NVIDIAExternalCareerSite
```

## CLI

```
python -m src.main [--platform astrazeneca|workday] [scope] [filters] [output]
```

### Date scope (choose at most one)

- `--today` (default when nothing else is set) - jobs posted today in `SCRAPE_TZ`.
- `--date YYYY-MM-DD` - exact date match.
- `--all` - no date filter.
- `--since YYYY-MM-DD` / `--until YYYY-MM-DD` - inclusive date range (can combine).

### Filters (all case-insensitive, all optional)

- `--keyword`/`-k` - free-text; pushed to the server when supported.
- `--location`/`-l` - substring match on city/region/country.
- `--country` - substring match on country.
- `--employment-type` - e.g. `"Full time"`.
- `--limit N` - stop as soon as N matches are collected.

### Output

- `--excel PATH` - also write matching jobs to an .xlsx file (with a native
  Excel table and clickable URLs).
- `--dry-run` - skip Postgres (Excel still writes if `--excel` is set).
- `--no-db` - skip Postgres even if `DATABASE_URL` is configured.

### Performance

- `--max-workers N` - concurrent detail fetches (default 8).
- `--max-pages N` - cap listing pages scanned.
- `-v`/`--verbose` - DEBUG logging.

### Examples

Today's AstraZeneca postings, Excel only:

```bash
python -m src.main --today --excel data/today.xlsx --no-db
```

Every US-based Full-time role posted in the last week:

```bash
python -m src.main --platform astrazeneca \
  --since 2026-07-11 --until 2026-07-18 \
  --country "United States" --employment-type "Full time" \
  --excel data/us-fulltime.xlsx
```

Data engineering roles matching a keyword, capped at 25 results:

```bash
python -m src.main --all -k "data engineer" --limit 25 --excel data/de.xlsx
```

Workday portal (NVIDIA example) via env var:

```bash
WORKDAY_BASE_URL="https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite" \
python -m src.main --platform workday --today --excel data/nvidia-today.xlsx --no-db
```

## Schema (Postgres)

```sql
CREATE TABLE IF NOT EXISTS jobs (
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
```

Re-runs are idempotent thanks to `ON CONFLICT (source, job_id) DO UPDATE`.

## Adding a new ATS platform

Two files, no wiring plumbing.

1. Create `src/ats/<name>.py`:

   ```python
   from ..models import JobDetail, JobStub, SearchFilters
   from .base import BaseAtsScraper
   from .registry import register

   @register("greenhouse")
   class GreenhouseScraper(BaseAtsScraper):
       display_name = "Greenhouse"

       def discover_stubs(self, filters: SearchFilters) -> tuple[list[JobStub], int]:
           # 1. call the source's search endpoint (push filters when supported)
           # 2. return [(JobStub(...), ...], total_pages)
           ...

       def fetch_detail(self, stub: JobStub) -> JobDetail:
           # fetch and return a JobDetail
           ...
   ```

2. Import it in [src/ats/__init__.py](src/ats/__init__.py) so the
   `@register` side-effect runs on startup:

   ```python
   from . import greenhouse  # noqa: F401
   ```

That's it. The base class handles concurrency, retries (via the shared
`http_client` session), and re-applies every `SearchFilters` field
client-side, so a plugin only has to be honest about what it can push to the
source natively.

## Layout

```
src/
  __init__.py
  main.py            # argparse CLI
  scraper.py         # thin facade: run_platform(name, filters)
  models.py          # JobStub / JobDetail / SearchFilters / ScrapeResult
  http_client.py     # shared requests.Session + tenacity retries
  parser.py          # generic HTML/JSON-LD helpers
  db.py              # Postgres schema + upsert (jobs table, (source,job_id) PK)
  excel_writer.py    # styled .xlsx export
  ats/
    __init__.py      # registers concrete scrapers
    base.py          # BaseAtsScraper template + apply_client_filters()
    registry.py      # @register / get_scraper / list_platforms
    astrazeneca.py   # TalentBrew AZ careers scraper
    workday.py       # generic Workday CXS scraper (config-driven)
```

## Notes

- Politeness: descriptive User-Agent, small pre-request jitter, bounded
  concurrency, exponential backoff on 429/5xx.
- AstraZeneca is a TalentBrew-hosted portal (not literally Workday). It's
  registered as `astrazeneca` and behaves like any other plugin.
- The Workday plugin talks to the JSON CXS API used by every
  `*.myworkdayjobs.com` site; you configure the tenant/site once via env vars.
