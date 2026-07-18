"""Generic HTML/JSON-LD parsing helpers shared by concrete scrapers.

Anything platform-specific lives in ``src.ats.<platform>`` modules; this file
holds only utilities.
"""

from __future__ import annotations

import json
import os
import re
from datetime import date, datetime, timedelta
from html import unescape
from typing import Any
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

_JSON_LD_DATE_FORMATS = ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ")

# Workday's public "postedOn" field is a human string, not an ISO date -
# e.g. "Posted Today", "Posted Yesterday", "Posted 3 Days Ago", "30+ Days Ago".
# ATS "days ago" strings on other portals look similar so this lives in the
# shared parser rather than the Workday scraper.
_DAYS_AGO_RE = re.compile(
    r"posted\s+(?P<n>\d+)\+?\s+day", re.IGNORECASE,
)


def _today_local() -> date:
    """Today's date in ``SCRAPE_TZ`` (falls back to UTC).

    Keeps "Posted Today" consistent with what the API sends as ``date_exact``
    when the user picks the default "Today (SCRAPE_TZ)" filter.
    """
    tz_name = os.getenv("SCRAPE_TZ", "UTC")
    try:
        return datetime.now(ZoneInfo(tz_name)).date()
    except Exception:  # noqa: BLE001 - unknown tz name
        return datetime.utcnow().date()


def parse_human_date(value: Any) -> date | None:
    """Parse ATS-style relative dates like "Posted Today" / "Posted 3 Days Ago".

    Returns ``None`` for anything unrecognised so callers can chain it after
    :func:`parse_date` for ISO strings.
    """
    if not isinstance(value, str):
        return None
    text = value.strip().lower()
    if not text:
        return None
    today = _today_local()
    if "today" in text:
        return today
    if "yesterday" in text:
        return today - timedelta(days=1)
    m = _DAYS_AGO_RE.search(text)
    if m:
        return today - timedelta(days=int(m.group("n")))
    return None

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t]+")
_NEWLINE_RE = re.compile(r"\n{3,}")


def parse_date(value: Any) -> date | None:
    """Parse a date from many common ATS shapes.

    Handles zero-padded ISO (``2026-07-17``), un-padded ISO (``2026-7-17``),
    Workday's ``2026-07-17T00:00:00Z``, ``DD/MM/YYYY``, ``DD-MMM-YYYY``, etc.
    Returns ``None`` for anything unrecognised or empty.
    """
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value:
        return None

    iso_match = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$", value)
    if iso_match:
        y, m, d, rest = iso_match.groups()
        normalized = f"{int(y):04d}-{int(m):02d}-{int(d):02d}{rest}"
        for fmt in _JSON_LD_DATE_FORMATS:
            try:
                return datetime.strptime(normalized, fmt).date()
            except ValueError:
                continue
        try:
            return date.fromisoformat(normalized[:10])
        except ValueError:
            pass

    for fmt in ("%d/%m/%Y", "%d-%b-%Y", "%d %b %Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue

    return None


def strip_html(raw: str | None) -> str | None:
    """Strip tags/entities from an HTML fragment. Returns ``None`` if empty."""
    if not raw:
        return None
    text = _TAG_RE.sub("", raw)
    text = unescape(text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _WS_RE.sub(" ", text)
    text = _NEWLINE_RE.sub("\n\n", text)
    return text.strip() or None


def first_job_posting(soup: BeautifulSoup) -> dict[str, Any] | None:
    """Return the first ``application/ld+json`` block with ``@type=JobPosting``."""
    for script in soup.find_all("script", type="application/ld+json"):
        raw = script.string or script.get_text() or ""
        raw = raw.strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        candidates = data if isinstance(data, list) else [data]
        for candidate in candidates:
            if isinstance(candidate, dict) and candidate.get("@type") == "JobPosting":
                return candidate
    return None


__all__ = ["parse_date", "parse_human_date", "strip_html", "first_job_posting"]
