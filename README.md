# JobPilot

Monorepo for job search tooling.

## Projects

| Folder | Purpose | Status |
|--------|---------|--------|
| [`jd-match-scoring/`](./jd-match-scoring/) | Resume ↔ JD match scoring UI (React + Vite) | Active |
| [`job-autofill-scraper/`](./job-autofill-scraper/) | Browser extension + API to auto-fill job applications (Workday, Greenhouse) | Active |
| [`JobPilot-Parser/`](./JobPilot-Parser/) | Resume parsing app | Existing |
| [`Scraper Code/`](./Scraper%20Code/) | Legacy scraper code | Existing |

## Quick start

### JD Match Scoring

```bash
cd jd-match-scoring
npm install
npm run dev
```

Open the URL shown in the terminal (default: http://localhost:5173/).

```bash
npm test
npm run build
```

### Job Autofill Scraper

```bash
cd job-autofill-scraper
npm install
npm run build
npm run dev:backend
```

Load the unpacked extension from `job-autofill-scraper/extension/` in Chrome. See [`job-autofill-scraper/README.md`](./job-autofill-scraper/README.md) for full setup.

## Repository layout

```text
jobpilot/
├── README.md
├── jd-match-scoring/         # Match scoring web app
├── job-autofill-scraper/     # Autofill extension + backend + scraper
├── JobPilot-Parser/
└── Scraper Code/
```

## Notes

- Each project has its own `package.json` — run `npm install` inside each folder.
- Copy `job-autofill-scraper/.env.example` to `.env` for API/Supabase credentials (never commit `.env`).
