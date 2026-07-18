# JobPilot — JD Match Scoring

React UI for resume-to-job-description match scoring using keyword/skill overlap.

## Features

- Skill aliases map — K8s → Kubernetes, JS → JavaScript, Amazon Web Services → AWS, etc.
- Upload full resume files (PDF, DOCX, TXT, MD) or paste text
- Skills taxonomy with 150+ technical skills, tools, and technologies
- Word-boundary skill extraction (case-insensitive, avoids partial matches like `java` in `javascript`)
- Basic match score: `% of JD skills found in your summary`
- Weighted scoring: required/must-have skills count 2x vs nice-to-have
- Explainable output: matched skills, missing skills, and weighted breakdown

## Quick start

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (default: http://localhost:5173).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run test` | Run unit tests |

## Architecture

Pure scoring modules in `src/lib/` — reusable for batch job ingestion or on-demand UI:

- `skillsTaxonomy.ts` / `data/skillsTaxonomy.json` — reference skill list
- `data/skillAliases.json` — alternate names mapped to canonical taxonomy skills
- `skillAliases.ts` — alias map loader and search-term helpers
- `skillExtractor.ts` — extract skills from text (canonical names + aliases)
- `matchScorer.ts` — basic and weighted scoring
- `resumeParser.ts` — parse PDF/DOCX/TXT resume files into plain text
- `jdMatchService.ts` — integration facade

## Scoring formula

**Basic:** `score = (matched JD skills / total JD skills) × 100`

**Weighted:** required skills × 2, preferred/other × 1

Edge case: empty JD skills → score 0, no division by zero.
