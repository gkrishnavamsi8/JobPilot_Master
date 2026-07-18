# Project Prompt: Job Application Autofill Browser Extension

## Context
I want to build a browser extension (similar to "Simplify") that automatically fills out job application forms on ATS portals — starting with **Workday** — using my own stored candidate data, instead of manually re-entering the same information on every application.

## Existing Infrastructure

### Database schema (Postgres)
```sql
create table public.candidates (
  id uuid not null default gen_random_uuid (),
  email character varying(320) null,
  first_name character varying(100) null,
  last_name character varying(100) null,
  resume_path text null,
  resume_filename character varying(255) null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint candidates_pkey primary key (id)
) TABLESPACE pg_default;
create index IF not exists idx_candidates_email on public.candidates using btree (email) TABLESPACE pg_default;
create index IF not exists idx_candidates_updated_at on public.candidates using btree (updated_at desc) TABLESPACE pg_default;
create index IF not exists idx_candidates_data_gin on public.candidates using gin (data) TABLESPACE pg_default;
create trigger candidates_set_updated_at BEFORE
update on candidates for EACH row
execute FUNCTION set_updated_at ();
```

### `data` jsonb column — structure
The `data` column holds parsed resume data with this general shape (fields may be null if not extracted):
```json
{
  "legal": {
    "terms_accepted": false,
    "marketing_opt_in": null,
    "privacy_policy_accepted": false,
    "background_check_consent": null
  },
  "profile": {
    "email": "string",
    "phone": { "type": "mobile", "number": "string", "country_code": null },
    "skills": ["array", "of", "strings"],
    "social": { "github": null, "twitter": null, "website": null, "linkedin": null, "portfolio": null, "other": {} },
    "address": { "city": null, "line1": null, "line2": null, "state": null, "country": null, "postal_code": null },
    "summary": "string",
    "last_name": "string",
    "first_name": "string",
    "preferred_name": null
  },
  "education": [
    { "gpa": null, "degree": "string|null", "school": "string", "end_date": "date|null", "is_current": false, "start_date": "date|null", "field_of_study": "string|null" }
  ],
  "preferences": {
    "referred_by": null,
    "desired_salary": null,
    "referral_source": null,
    "salary_currency": "USD",
    "remote_preference": null,
    "notice_period_days": null,
    "willing_to_relocate": null,
    "years_of_experience": 1.5,
    "available_start_date": null
  },
  "cover_letter": null,
  "demographics": null,
  "custom_answers": [],
  "work_experience": [
    {
      "title": "string|null",
      "company": "string",
      "end_date": "date|null",
      "location": "string|null",
      "is_current": true,
      "start_date": "date",
      "description": "string",
      "employment_type": "string|null"
    }
  ],
  "additional_files": [],
  "work_authorization": null
}
```

## What to Build

### 1. Backend API endpoint
A simple `GET /candidates/:id` (or lookup by email) endpoint that returns the candidate's `data` jsonb blob to the extension. Keep it minimal for now — auth can be a simple API key or session token passed from the extension.

### 2. Chrome Extension (Manifest V3)
- **Content script** that runs on job portal pages (start with Workday domains — these follow the pattern `*.myworkdayjobs.com` and `*.wd1.myworkdayjobs.com` etc.)
- **Popup/background script** to fetch the candidate's data from the backend API and pass it to the content script.

### 3. Field Detection & Mapping Engine (core logic)

**Primary strategy — Workday `data-automation-id` targeting:**
Workday consistently uses `data-automation-id` attributes on form elements even though visible labels vary by company. Build:
- A scanner that walks the DOM for elements with `data-automation-id` attributes matching known patterns.
- A mapping table: `data-automation-id substring pattern → candidate JSON path`. Example entries to start with:
  - `*legalName*firstName*` → `profile.first_name`
  - `*legalName*lastName*` → `profile.last_name`
  - `*email*` → `profile.email`
  - `*phone*number*` → `profile.phone.number`
  - `*address*city*` → `profile.address.city`
  - (extend this table iteratively by inspecting real Workday pages)

**Fallback strategy — label-text fuzzy matching:**
For fields without a matched automation-id pattern, extract the associated `<label>` text and fuzzy-match against a synonym dictionary (e.g., "Email Address" / "Email" / "Contact Email" → `profile.email`). Use this as a secondary pass, not the primary method for Workday.

### 4. Field-type-specific fill logic
Different input types need different handling:
- **Plain text inputs:** Set value and dispatch proper events so React-controlled state updates: `element.dispatchEvent(new Event('input', { bubbles: true }))` (setting `.value` alone will NOT work on most modern SPA forms including Workday).
- **Dropdowns/select-like custom components:** Find the matching option by visible text (not just value) and simulate a selection click — Workday often uses custom dropdown components, not native `<select>`, so this may require clicking to open the dropdown, then clicking the matching option element.
- **Multi-select / tag inputs (e.g., Skills):** Iterate the candidate's skills array, and for each, trigger the input's "add" interaction (type text, wait for suggestion, click/select it, or press Enter — inspect the actual component behavior).
- **Checkboxes:** Set `.checked` and dispatch `click` or `change` event as appropriate.
- **Repeatable sections (Education, Work Experience):** Detect "Add Another"/"+" buttons, click to add N entries (matching the candidate's array length), then fill each entry's sub-fields using the same mapping approach scoped to that entry's container.
- **File upload (Resume):** Do NOT attempt to programmatically set the file input's value — browsers block this for security and it cannot be worked around with plain JS. For v1, skip auto-filling this field; just make sure the extension doesn't error out on it, and optionally scroll/highlight the field so the user knows to upload manually.

### 5. Known constraints to design around
- Browser security prevents JS from setting `<input type="file">` values — resume upload stays manual in v1.
- Each company's Workday tenant may have slightly different `data-automation-id` values or extra/missing fields — the mapping table should be designed to fail gracefully (skip unmapped fields, log them for manual review) rather than break the whole autofill run.
- Respect that this tool fills forms as an assistive action for the user's own applications — it should not attempt to auto-submit applications or bypass any human review/CAPTCHA steps.

## Suggested Build Order
1. Backend endpoint to serve candidate data by ID.
2. Extension skeleton (Manifest V3, content script injection on Workday domains, popup for candidate ID/login).
3. Build the `data-automation-id` mapping table by inspecting ONE real Workday careers page manually (use browser DevTools to find actual attribute values).
4. Implement fill logic for simple text fields first (name, email, phone) — validate the event-dispatch approach works and values actually register in the page's state.
5. Add dropdown/select handling.
6. Add repeatable section handling (Education, Work Experience arrays).
7. Add checkbox/multi-select (Skills) handling.
8. Test against 2-3 different companies' Workday tenants; refine the mapping table into a config that's easy to extend without touching core logic.
9. (Later) Add a fallback label-fuzzy-matching layer for non-Workday ATS platforms (Greenhouse, Lever, etc.).

## Tech Stack
- Extension: JavaScript (Manifest V3), vanilla DOM APIs (no framework needed for a content script).
- Backend: match whatever stack the candidate API is already built in (Node/Python — flexible, just needs to serve the jsonb data as JSON).
- Database: existing Postgres `candidates` table (schema above) — no changes needed for v1.

## What I need help with
Please scaffold this project starting with:
1. The Manifest V3 extension skeleton (manifest.json, content script, popup).
2. The `data-automation-id` mapping table structure (as an extensible config object) with the starter entries listed above.
3. The core fill-engine logic that reads the mapping table, finds matching DOM elements, and fills them with proper event dispatching — starting with plain text fields only.
4. A clean interface so dropdown/multi-select/repeatable-section handlers can be added incrementally without rewriting the core engine.
