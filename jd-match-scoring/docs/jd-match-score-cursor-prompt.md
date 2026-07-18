# Cursor Prompt: JD Match Scoring Feature

## Context
I'm building a job search aggregator app. I need to implement a **resume-to-job-description match scoring feature** using a keyword/skill overlap approach (no AI/LLM calls — simple, fast, explainable).

## What to build

### 1. Skills taxonomy
Create a reference list/dictionary of known technical skills, tools, and technologies (e.g., Java, Python, Spring Boot, Kafka, Docker, Kubernetes, AWS, GCP, React, SQL, Machine Learning, LLM, RAG, etc.). Structure it so it's easy to extend later. Store it as a JSON or Python list/set that can be imported.

### 2. Skill extraction function
Write a function that takes a block of text (either a professional summary or a job description) and the skills taxonomy, and returns the set of skills found in that text. Use word-boundary matching (regex) to avoid partial-word false matches (e.g., "java" shouldn't match inside "javascript"). Matching should be case-insensitive.

### 3. Match scoring function
Write a function that takes:
- `user_skills` (set of skills extracted from the user's professional summary)
- `jd_skills` (set of skills extracted from a job description)

And returns:
- `score`: percentage of JD-required skills that the user has, i.e. `len(matched) / len(jd_skills) * 100`, rounded to 1 decimal
- `matched_skills`: sorted list of skills present in both
- `missing_skills`: sorted list of skills in the JD but not in the user's summary

Handle the edge case where `jd_skills` is empty (return score 0, empty lists — don't divide by zero).

### 4. Optional weighting (stretch goal, implement after the basic version works)
Improve the score by giving more weight to skills that appear in a "Required"/"Must-have" section of the JD versus a "Nice to have"/"Preferred" section. This can be done by splitting the JD text on common section headers (regex) before running skill extraction, and applying a higher weight (e.g., 2x) to skills found in the "required" section when computing the score.

### 5. Integration point
This scoring function should be callable as a standalone module/service, since it will be used:
- At job-ingestion time (daily cron job) — computing and storing a score for every newly scraped job against the stored user professional summary.
- On-demand — when a user pastes in a specific job description to check their fit.

Design it as a pure function (no side effects, no DB calls inside it) so it can be reused in both contexts. The calling code (cron job vs. on-demand endpoint) will handle fetching the text and storing/returning the result.

## Tech constraints
- Python.
- No external NLP libraries required for v1 — plain `re` module is sufficient. (Open to spaCy later if the taxonomy grows large enough that performance matters.)
- Include a few unit tests: one with strong overlap, one with no overlap, one with an empty JD.

## Deliverables
1. `skills_taxonomy.py` (or `.json`) — the reference skill list.
2. `skill_extractor.py` — the extraction function.
3. `match_scorer.py` — the scoring function(s), including the weighted variant as a separate function or optional parameter.
4. `test_match_scorer.py` — basic unit tests.
