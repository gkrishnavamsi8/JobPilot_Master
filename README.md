# JobPilot Master — Integrated Monorepo

End-to-end job search workflow:

**Sign in → Parse resume → Scrape jobs → Preview match → Apply & track → Extension overlay → Autofill**

The unified web app has account login (register/sign-in), a dashboard, profile
(resume parsing), a scored job browser, a scraper admin page, and an application
tracker. The Parser API owns auth (`/auth/register`, `/auth/login`, `/auth/me`)
and application logging (`/applications`); tokens are HMAC-signed — set
`SECRET_KEY` in `apps/parser-api/.env` for production. The Parser runs on SQLite
out of the box, so login → profile → jobs → applications works with no Supabase
configured (the job browser falls back to labeled sample listings until the
Scraper API is up).

## Repository layout

```text
apps/
  web/                 Unified React frontend (port 5173)
  parser-api/          Resume parsing + auth + applications API (FastAPI, port 8002)
  scraper-api/         Job scraper API (FastAPI, port 8000)
  autofill-extension/  Chrome extension + autofill API (port 3001)
  match-sandbox/       Standalone JD-match scoring playground
packages/
  match-core/          Shared JD match scoring library
  shared-types/        Shared candidate/job types + helpers
docs/                  Architecture and integration plan
scripts/               Monorepo-level scripts
```

## Quick start

### 1. Environment

Copy root env template into each service as needed:

```powershell
copy .env.example .env
```

Configure Supabase credentials in:
- `apps/parser-api/.env`
- `apps/scraper-api/.env`
- `apps/autofill-extension/.env`

### 2. Install JS dependencies

```powershell
cd D:\JobPilot_Master
npm install
```

### 3. Start services (4 terminals)

```powershell
# Parser API
cd apps/parser-api
pip install -r requirements.txt && pip install -e .
uvicorn jobpilot.api.main:app --reload --port 8002

# Scraper API
cd apps/scraper-api
pip install -r requirements.txt
uvicorn server.main:app --reload --port 8000

# Autofill API
cd apps/autofill-extension
npm run dev:backend

# Unified frontend
cd apps/web
npm run dev
```

### 4. Load Chrome extension

```powershell
npm run build:extension
```

Load unpacked from `apps/autofill-extension/extension/` in Chrome.

## User journey

1. Open **http://localhost:5173** → create an account or sign in
2. **Dashboard** shows profile strength, jobs viewed, and applied counts
3. **Profile** → upload resume → review parsed fields → save (one profile per account)
4. **Jobs** → browse scored listings (match ring + matched/missing skills)
5. **Scraper** → admin page to run scrapes from the UI: pick a company, set filters, watch the run live
6. Click **Apply** → ATS page opens with `jp_candidate` + `jp_job` URL params, and the event is tracked
7. **Applications** → every opened job with its match snapshot; mark viewed/applied/skipped
8. Extension shows **match overlay** on the apply page
9. Click **Autofill application** → form filled from saved profile

## Testing

```powershell
npm test
```

Runs match-core unit tests + integration smoke tests.

## API additions for integration

| Service | Endpoint |
|---------|----------|
| Parser | `POST /auth/register` · `POST /auth/login` · `GET /auth/me` |
| Parser | `GET /candidates/me` (auth) |
| Parser | `POST /applications` · `GET /applications` · `PATCH /applications/{id}` (auth) |
| Parser | `GET /candidates/{id}/match-text` |
| Scraper | `GET /api/jobs/by-key?company_id=&source=&job_id=` |
| Scraper | `GET /api/jobs/by-url?url=` |
