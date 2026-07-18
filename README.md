# JobPilot Master — Integrated Monorepo

End-to-end job search workflow:

**Parse resume → Scrape jobs → Preview match → Apply → Extension overlay → Autofill**

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

1. Open **http://localhost:5173/profile** → upload resume → save profile
2. Open **http://localhost:5173/jobs** → browse scraped jobs with match preview
3. Click **Apply** → ATS page opens with `jp_candidate` + `jp_job` URL params
4. Extension shows **match overlay** on the apply page
5. Click **Autofill application** → form filled from saved profile

## Testing

```powershell
npm test
```

Runs match-core unit tests + integration smoke tests.

## API additions for integration

| Service | Endpoint |
|---------|----------|
| Parser | `GET /candidates/{id}/match-text` |
| Scraper | `GET /api/jobs/by-key?company_id=&source=&job_id=` |
| Scraper | `GET /api/jobs/by-url?url=` |
