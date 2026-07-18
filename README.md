# JobPilot Master — Integrated Monorepo

End-to-end job search workflow:

**Sign in → Parse resume → Scrape jobs → Preview match → Apply & track → Extension overlay → Autofill**

The unified web app has account login (register/sign-in), a dashboard, profile
(resume parsing), a scored job browser, and an application tracker. The Parser
API owns auth (`/auth/register`, `/auth/login`, `/auth/me`) and application
logging (`/applications`); tokens are HMAC-signed — set `SECRET_KEY` in
`JobPilot-Parser/.env` for production. The Parser runs on SQLite out of the box,
so login → profile → jobs → applications works with no Supabase configured
(the job browser falls back to labeled sample listings until the Scraper API
is up).

## Projects

| Path | Role |
|------|------|
| `JobPilot-Parser/` | Step 1 — Resume parsing API (port **8002**) |
| `Scraper Code/` | Step 2 — Job scraper API (port **8000**) |
| `frontend/` | Steps 1+3 — Unified UI (Profile + Jobs, port **5173**) |
| `packages/match-core/` | Shared JD match scoring library |
| `packages/shared-types/` | Shared candidate/job types + helpers |
| `job-autofill-scraper/` | Steps 4+5 — Extension + autofill API (port **3001**) |
| `jd-match-scoring/` | Standalone scoring sandbox |

See [`docs/INTEGRATION_PLAN.md`](./docs/INTEGRATION_PLAN.md) for architecture details.

## Quick start

### 1. Environment

Copy root env template into each service as needed:

```powershell
copy .env.example .env
```

Configure Supabase credentials in:
- `JobPilot-Parser/.env`
- `Scraper Code/.env`
- `job-autofill-scraper/.env`

### 2. Install JS dependencies

```powershell
cd D:\Projects\JobPilot-Master
npm install
```

### 3. Start services (4 terminals)

```powershell
# Parser API
cd JobPilot-Parser
pip install -r requirements.txt && pip install -e .
uvicorn jobpilot.api.main:app --reload --port 8002

# Scraper API
cd "Scraper Code"
pip install -r requirements.txt
uvicorn server.main:app --reload --port 8000

# Autofill API
cd job-autofill-scraper
npm run dev:backend

# Unified frontend
cd frontend
npm run dev
```

### 4. Load Chrome extension

```powershell
cd job-autofill-scraper
npm run build
```

Load unpacked from `job-autofill-scraper/extension/` in Chrome.

## User journey

1. Open **http://localhost:5173** → create an account or sign in
2. **Dashboard** shows profile strength, jobs viewed, and applied counts
3. **Profile** → upload resume → review parsed fields → save (one profile per account)
4. **Jobs** → browse scored listings (match ring + matched/missing skills)
   - **Scraper** → admin page to run scrapes from the UI: pick a company, set filters, watch the run live

5. Click **Apply** → ATS page opens with `jp_candidate` + `jp_job` URL params, and the event is tracked
6. **Applications** → every opened job with its match snapshot; mark viewed/applied/skipped
7. Extension shows **match overlay** on the apply page
8. Click **Autofill application** → form filled from saved profile

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
