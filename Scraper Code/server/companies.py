"""Company normalisation + platform detection on top of :mod:`server.store`.

The heavy lifting (schema introspection, PostgREST calls) lives in
``SupabaseStore``. This module adds:

- platform normalisation: map free-text values from ``ats_platform`` to a
  registered scraper plugin name.
- URL-based platform fallback via :func:`server.platform_detect.detect_platform`.
- client-side substring filter across (name, careers_url, platform).
"""

from __future__ import annotations

import logging
from typing import Any

from .platform_detect import detect_platform
from .store import Store, get_store

log = logging.getLogger(__name__)

_PLATFORM_ALIASES: dict[str, str] = {
    # normalised (lowercased, no space/underscore/dash) -> plugin name
    # Only include plugins that actually exist in :mod:`src.ats`. Adding an
    # alias for a platform without a plugin (e.g. talentbrew, phenompeople)
    # would incorrectly mark those companies as "supported" in the UI.
    "workday": "workday",
    "myworkday": "workday",
    "myworkdayjobs": "workday",
    "astrazeneca": "astrazeneca",
}


def _normalise_platform(raw: str | None, url: str | None) -> str | None:
    """Resolve a plugin name from either the DB's ``ats_platform`` or the URL host.

    URL-based detection wins when it identifies a specific plugin (the URL is
    site-specific and can override a coarse free-text label like ``Workday``
    that some rows use as a placeholder). Free-text ``raw`` is the fallback so
    entries that only set ``ats_platform`` still resolve.
    """
    url_hit = detect_platform(url)
    if url_hit:
        return url_hit
    if raw:
        cleaned = raw.strip().lower().replace(" ", "").replace("_", "").replace("-", "")
        if cleaned in _PLATFORM_ALIASES:
            return _PLATFORM_ALIASES[cleaned]
    return None


# Top-level metadata columns we promote out of `extras` onto the Company response.
_PROMOTED_KEYS = (
    "domain", "subdomain", "company_type", "tier", "priority",
    "hires_in_india", "india_locations", "scraping_method",
    "jobpilot_supported", "jobpilot_status",
)


def _annotate(row: dict[str, Any], supported: set[str]) -> dict[str, Any]:
    platform = _normalise_platform(row.get("raw_platform"), row.get("careers_url"))
    extras = dict(row.get("extras", {}))
    promoted = {k: extras.pop(k, None) for k in _PROMOTED_KEYS}
    live_supported = bool(platform and platform in supported)
    # Prefer the persisted verdict when present; fall back to the live
    # computation so the API keeps working before the DDL is applied.
    persisted_supported = promoted.get("jobpilot_supported")
    return {
        "id": str(row["id"]),
        "name": row.get("name"),
        "careers_url": row.get("careers_url"),
        "platform": platform,
        "raw_platform": row.get("raw_platform"),
        "supported": persisted_supported if persisted_supported is not None else live_supported,
        "is_active": row.get("is_active", True),
        "extras": extras,
        **promoted,
    }


def list_companies(
    *,
    query: str | None = None,
    platform: str | None = None,
    supported_platforms: set[str] | None = None,
    include_inactive: bool = False,
    store: Store | None = None,
) -> list[dict[str, Any]]:
    """Return normalised, annotated companies."""
    store = store or get_store()
    rows = store.list_companies(query=query, include_inactive=include_inactive)
    supported = supported_platforms or set()
    annotated = [_annotate(r, supported) for r in rows]

    if platform:
        annotated = [c for c in annotated if c["platform"] == platform]

    if query:
        q_lower = query.lower()
        annotated = [
            c for c in annotated
            if q_lower in " ".join(
                str(v) for v in (c["name"], c["careers_url"], c["platform"]) if v
            ).lower()
        ]

    annotated.sort(key=lambda c: (c["name"] or "").lower())
    return annotated


def get_company(company_id: str, *, store: Store | None = None) -> dict[str, Any] | None:
    store = store or get_store()
    row = store.get_company(company_id)
    if row is None:
        return None
    from src.ats import list_platforms  # local import to avoid circulars
    return _annotate(row, set(list_platforms()))


def companies_mapping() -> dict[str, str | None] | None:
    """Return the detected column mapping (Supabase backend only), for /health."""
    store = get_store()
    if hasattr(store, "companies_mapping"):
        try:
            return store.companies_mapping()  # type: ignore[attr-defined]
        except Exception:
            return None
    return None


__all__ = ["list_companies", "get_company", "companies_mapping"]
