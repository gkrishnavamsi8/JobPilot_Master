"""FastAPI back-end for the jobpilot UI.

Exposes a small REST API on top of the plugin-based scraper in ``src.ats``:

- List companies from the Supabase-hosted ``companies`` table (schema-tolerant).
- Kick off a scrape for a chosen company + filters.
- Poll live status of a scrape run.
- Read matching jobs and download them as an Excel file.
"""

__version__ = "0.1.0"
