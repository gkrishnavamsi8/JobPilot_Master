# JobPilot

Store **candidate profiles** — everything needed to fill job application forms on Greenhouse, Workday, Lever, etc. No job listings or company tracking.

## What gets stored (one `candidates` table)

| Section | Fields |
|---------|--------|
| **Profile** | Name, email, phone, address, LinkedIn/GitHub, skills, summary |
| **Work experience** | Company, title, dates, description |
| **Education** | School, degree, field, dates |
| **Work authorization** | Visa status, sponsorship needs |
| **Preferences** | Salary, relocation, start date, referral source |
| **Demographics** | Optional EEO (opt-in only) |
| **Custom answers** | Pre-written screening question answers |
| **Files** | Resume (on disk), cover letter metadata |

Resume upload auto-fills whatever it can parse; the UI collects the rest once.

## Flow

```
Upload resume → POST /resume/parse → auto-fill form
User completes missing fields → POST /candidates → Supabase
Your automation → GET /candidates/{id}
```

## UI (React)

```powershell
cd frontend
npm install
npm run dev
```

Open **http://127.0.0.1:5173** — upload resume, review auto-filled fields, save to Supabase.

Keep the API running in another terminal:

```powershell
uvicorn jobpilot.api.main:app --reload --port 8000
```

## Quick start (API only)

```powershell
cd D:\JobPilot
.venv\Scripts\activate
pip install -r requirements.txt
pip install -e .

# Set DATABASE_URL in .env (Supabase connection string)
python scripts/check_db.py

uvicorn jobpilot.api.main:app --reload --port 8000
```

## Database (Supabase)

Only one app table: **`candidates`**

```sql
candidates (
  id, email, first_name, last_name,
  resume_path, resume_filename,
  data jsonb,          -- full profile above
  created_at, updated_at
)
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/resume/parse` | Auto-fill from resume |
| POST | `/candidates` | Save profile |
| GET | `/candidates/{id}` | Read profile for automation |
| GET | `/schema/candidate` | JSON Schema for UI forms |
