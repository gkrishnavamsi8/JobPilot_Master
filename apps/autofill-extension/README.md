# JobPilot — Job Application Autofill

Browser extension + API that auto-fills **Workday** job application forms from your stored candidate profile in Postgres.

## Tech stack

| Layer | Stack |
|-------|--------|
| **Extension** | Chrome Manifest V3, vanilla JS (popup/background), esbuild-bundled content script |
| **Fill engine** | TypeScript, vanilla DOM APIs, handler registry pattern |
| **Backend API** | Node.js, Express, TypeScript, Supabase JS or `pg` (Postgres) |
| **Shared** | TypeScript types matching the `candidates.data` jsonb schema |

## Project structure

```text
job-autofill-scraper/
├── backend/            # GET /candidates/:id API
├── extension/          # Chrome MV3 extension (load unpacked from this folder)
│   ├── manifest.json
│   ├── popup/
│   ├── background/
│   └── content/
├── scraper/
│   ├── adapters/workday/   # data-automation-id mapping table + DOM scanner
│   └── fill-engine/        # Core engine + per-field-type handlers
├── shared/             # Candidate profile types & utilities
└── scripts/            # Extension bundler
```

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Run API + mock test page

```bash
npm run dev:backend
```

Open **http://localhost:3001/workday-mock.html** — a Workday-like form for local testing.

Sample JSON is also available at `GET /sample-data`.

### 4. Load extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder
4. Open the mock test page (or a real Workday application)
5. Open the JobPilot popup

### 5. Fill with your JSON (test mode)

1. Keep **Paste JSON (test mode)** selected (default)
2. Paste your candidate `data` jsonb object, or click **Load sample data**
3. Click **Fill this page**

You can also wrap the payload as `{ "data": { ... } }` — the popup unwraps it automatically.

### API mode — fetch from Supabase

1. Copy `.env.example` → `.env`
2. Add your Supabase credentials from [Project Settings → API](https://supabase.com/dashboard/project/aamvhktuijrwgrtucuij/settings/api):
   ```env
   SUPABASE_URL=https://aamvhktuijrwgrtucuij.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
   Use the **service_role** key (server-side only — never put it in the extension).
3. Start the API: `npm run dev:backend`
4. Verify: `GET http://localhost:3001/health` → `{ "database": "supabase" }`
5. In the extension popup → **Fetch from API** → enter your **email** → **Fill this page**

API endpoints:
- `GET /candidates?email=you@example.com` — lookup by email
- `GET /candidates/:id` — lookup by UUID
- `GET /candidates` — list recent candidates

### Supabase MCP (Cursor)

MCP is configured in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp?project_ref=aamvhktuijrwgrtucuij"
    }
  }
}
```

**To activate:**
1. Reload Cursor (`Developer: Reload Window`)
2. Open **Cursor Settings → MCP** — Supabase should appear
3. Click **Authenticate** and complete OAuth in the browser
4. After auth, the agent can run SQL against your `candidates` table via MCP

Supabase agent skills are installed at `.agents/skills/supabase`.

## Fill engine (v1)

**Implemented:**
- Workday `data-automation-id` DOM scanner with best-match scoring
- Extensible mapping table (`scraper/src/adapters/workday/mappings.ts`)
- Text/textarea fill with proper `input`/`change` event dispatch (React/SPA safe)
- **Custom dropdown** fill (click-to-open + option match) + native `<select>`
- **Multiselect / skills** fill (type → suggestion click → Enter fallback)
- **Repeatable sections** (Education, Work Experience — Add Another + per-entry fill)
- Checkbox handler
- Label-text fallback (secondary pass)
- File upload skip + highlight (manual upload required)
- **JSON paste test mode** in popup (no database required)
- Local **Workday mock test page** at `/workday-mock.html`

**Next iterations:**
- Refine mappings against real Workday tenants
- Date pickers and richer dropdown edge cases

## Extending mappings

Add entries to `WORKDAY_FIELD_MAPPINGS` in `scraper/src/adapters/workday/mappings.ts`:

```typescript
{
  automationIdPattern: /phone/i,
  jsonPath: 'profile.phone.number',
  fieldType: 'text',
  labelSynonyms: ['phone number'],
}
```

Then run `npm run build` and reload the extension.

## Related

- [`../jd-match-scoring/`](../jd-match-scoring/) — resume/JD match scoring
