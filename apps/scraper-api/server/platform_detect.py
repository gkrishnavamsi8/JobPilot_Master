"""Best-effort mapping from a career-portal URL to a scraper plugin name."""

from __future__ import annotations

import re
from urllib.parse import urlparse

# host regex -> registered scraper name. Order doesn't matter; first match wins.
_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(^|\.)myworkdayjobs\.com$", re.IGNORECASE), "workday"),
    (re.compile(r"^careers\.astrazeneca\.com$", re.IGNORECASE), "astrazeneca"),
    (re.compile(r"(^|\.)greenhouse\.io$", re.IGNORECASE), "greenhouse"),
    (re.compile(r"^jobs\.lever\.co$", re.IGNORECASE), "lever"),
    (re.compile(r"^jobs\.smartrecruiters\.com$", re.IGNORECASE), "smartrecruiters"),
    (re.compile(r"(^|\.)icims\.com$", re.IGNORECASE), "icims"),
    (re.compile(r"(^|\.)taleo\.net$", re.IGNORECASE), "taleo"),
    (re.compile(r"(^|\.)ashbyhq\.com$", re.IGNORECASE), "ashby"),
    (re.compile(r"(^|\.)recruitee\.com$", re.IGNORECASE), "recruitee"),
]


def detect_platform(url: str | None) -> str | None:
    """Return the plugin name matching ``url``'s host, or ``None`` if unknown."""
    if not url:
        return None
    parsed = urlparse(url if "://" in url else f"https://{url}")
    host = (parsed.hostname or "").strip().lower()
    if not host:
        return None
    for pattern, name in _PATTERNS:
        if pattern.search(host):
            return name
    return None


__all__ = ["detect_platform"]
