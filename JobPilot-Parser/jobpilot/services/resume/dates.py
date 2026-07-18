"""Date parsing helpers."""

from __future__ import annotations

import re
from datetime import date

from jobpilot.services.resume.patterns import DATE_RANGE_RE, MONTH_MAP, SINGLE_MONTH_DATE_RE, YEAR_ONLY_RE


def parse_date_token(token: str) -> date | None:
    token = token.strip()
    if YEAR_ONLY_RE.fullmatch(token):
        return date(int(token), 1, 1)
    slash = re.fullmatch(r"(\d{1,2})/(\d{4})", token)
    if slash:
        return date(int(slash.group(2)), int(slash.group(1)), 1)
    dashed = re.fullmatch(r"(\d{1,2})-(\d{1,2})-(\d{4})", token)
    if dashed:
        return date(int(dashed.group(3)), int(dashed.group(2)), int(dashed.group(1)))
    month = re.match(r"([A-Za-z]+)\.?\s+(\d{4})", token)
    if month:
        key = month.group(1)[:3].lower()
        return date(int(month.group(2)), MONTH_MAP.get(key, 1), 1)
    return None


def parse_date_range(line: str) -> tuple[date | None, date | None, bool]:
    """Return (start, end, is_current) from a line containing a date range."""
    match = DATE_RANGE_RE.search(line)
    if not match:
        if SINGLE_MONTH_DATE_RE.match(line.strip()):
            return parse_date_token(line.strip()), None, False
        return None, None, False

    start = parse_date_token(match.group("start"))
    end_raw = match.group("end")
    is_current = end_raw.lower() in {"present", "current", "now"}
    end = None if is_current else parse_date_token(end_raw)
    return start, end, is_current


def strip_dates(text: str) -> str:
    return DATE_RANGE_RE.sub("", text).strip(" ,|–—-")
