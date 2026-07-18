"""Guess the correct Workday ``site`` slug for companies whose stored URL 404s.

Workday tenants share the same URL shape:
    https://<tenant>.wdN.myworkdayjobs.com/<locale>/<site>          # public
    https://<tenant>.wdN.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs   # CXS API

The tenant is easy; the ``site`` slug (``External``, ``NVIDIAExternalCareerSite``,
``Corporate_Careers``, ...) varies. This script iterates a broad list of common
slug names + tenant-derived variants, hits the CXS ``/jobs`` endpoint for each,
and records the first one that answers with valid JSON.

Usage
-----
    .venv/bin/python -m scripts.find_workday_slug            # dry-run, all failing rows
    .venv/bin/python -m scripts.find_workday_slug --apply    # patch companies row
    .venv/bin/python -m scripts.find_workday_slug --only 87,115
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sys
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.store import get_store  # noqa: E402
from src.http_client import build_session  # noqa: E402

log = logging.getLogger("find_workday_slug")

WORKDAY_HOST_RE = re.compile(
    r"^https?://(?P<host>(?P<tenant>[a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com)",
    re.IGNORECASE,
)

# Generic slug names we've seen in the wild across many Workday tenants.
GENERIC_SLUGS = [
    "External", "External_Career", "External_Career_Site", "External_Careers",
    "ExternalCareers", "External_Site", "Careers", "External_Jobs",
    "Corporate_Careers", "Corporate", "Global_Careers", "Global_Career",
    "Professional_Careers", "US_Careers", "USCareers", "Job_Portal",
    "Job_Board", "MyCareer", "Corporate_Career_Site", "External_Corporate",
    "1", "2", "3", "Main_Site", "Public",
]

# Locales to try for the public URL check. CXS itself is locale-free.
LOCALES = ["en-US", "en-us", "en_US", "en", ""]


def _tenant_variants(tenant: str) -> list[str]:
    """Slug variants derived from the tenant string.

    ``nvidia`` -> ``Nvidia_Careers``, ``NvidiaExternalCareerSite``, ...
    Uppercase first-letter versions cover Workday's common convention.
    """
    t_lower = tenant.lower()
    t_title = tenant[:1].upper() + tenant[1:].lower()
    t_upper = tenant.upper()
    seen: list[str] = []
    for base in (t_lower, t_title, t_upper):
        for suffix in ("", "_Careers", "Careers", "_External", "External",
                       "ExternalCareerSite", "ExternalCareers",
                       "_External_Career_Site", "_Corporate_Careers"):
            slug = f"{base}{suffix}"
            if slug not in seen:
                seen.append(slug)
    return seen


def _try_cxs(session: requests.Session, host: str, tenant: str,
             slug: str) -> tuple[bool, str]:
    """Probe the CXS endpoint. Returns (ok, http_status_or_error)."""
    url = f"https://{host}/wday/cxs/{tenant}/{slug}/jobs"
    try:
        resp = session.post(
            url,
            json={"limit": 1, "offset": 0, "searchText": "", "appliedFacets": {}},
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                # A referer that matches the tenant tends to pass the
                # anti-bot heuristics that some Workday edges enforce.
                "Referer": f"https://{host}/",
            },
            timeout=8.0,
            allow_redirects=False,
        )
        ctype = resp.headers.get("content-type", "")
        if resp.status_code == 200 and "application/json" in ctype:
            return True, "200"
        return False, f"{resp.status_code} ({ctype.split(';')[0] or 'no-ctype'})"
    except requests.RequestException as exc:
        return False, exc.__class__.__name__


def _pick_locale(session: requests.Session, host: str, slug: str) -> str:
    """Find the locale segment the tenant serves. Falls back to en-US."""
    for locale in LOCALES:
        url = (f"https://{host}/{locale}/{slug}" if locale
               else f"https://{host}/{slug}")
        try:
            r = session.get(url, timeout=8.0, allow_redirects=True,
                            headers={"Accept": "text/html"})
            if r.status_code == 200:
                return locale or "en-US"
        except requests.RequestException:
            continue
    return "en-US"


def _hunt(session, host: str, tenant: str) -> tuple[str, str] | None:
    """Return (locale, slug) if any variant works, else None."""
    seen: set[str] = set()

    # Try tenant-derived slugs first (higher hit rate), then generics.
    candidates = _tenant_variants(tenant) + GENERIC_SLUGS
    for slug in candidates:
        if slug in seen:
            continue
        seen.add(slug)
        ok, why = _try_cxs(session, host, tenant, slug)
        log.info("  slug=%s  -> %s", slug, why)
        if ok:
            locale = _pick_locale(session, host, slug)
            return locale, slug
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--apply", action="store_true",
                    help="Patch companies.official_careers_url when a slug is found.")
    ap.add_argument("--only", type=str, default=None,
                    help="Comma-separated company ids (default: all workday rows currently marked unsupported).")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s %(message)s",
    )

    store = get_store()

    # Fetch companies whose ats_platform is workday, jobpilot_supported=false,
    # AND official_careers_url is already a *.myworkdayjobs.com URL. Those are
    # the ones where only the site slug is wrong; other failures need a
    # different fix (marketing landing pages, etc.).
    resp = store._request(  # type: ignore[attr-defined]
        "GET", "companies",
        params={
            "select": "id,company_name,official_careers_url,jobpilot_status",
            # ats_platform is stored with mixed casing ("Workday" / "workday");
            # ilike is case-insensitive.
            "ats_platform": "ilike.workday",
            "jobpilot_supported": "is.false",
            "official_careers_url": "ilike.*myworkdayjobs.com*",
            "order": "id.asc",
        },
    )
    rows: list[dict[str, Any]] = resp.json()

    only_ids = {s.strip() for s in (args.only or "").split(",") if s.strip()}
    if only_ids:
        rows = [r for r in rows if str(r["id"]) in only_ids]

    if not rows:
        print("Nothing to hunt (no workday rows with unsupported=false and myworkdayjobs URL).")
        return 0

    print(f"Hunting slugs for {len(rows)} company/companies...\n")
    session = build_session()
    results: list[tuple[dict, tuple[str, str] | None]] = []

    for row in rows:
        m = WORKDAY_HOST_RE.match(row.get("official_careers_url") or "")
        if not m:
            print(f"  #{row['id']:>3} {row['company_name']}: URL not a Workday tenant, skipping.")
            continue
        host, tenant = m.group("host"), m.group("tenant").lower()
        print(f"  #{row['id']:>3} {row['company_name']:<28} host={host}  tenant={tenant}")
        found = _hunt(session, host, tenant)
        if found:
            locale, slug = found
            new_url = f"https://{host}/{locale}/{slug}"
            print(f"     FOUND: {new_url}\n")
        else:
            new_url = None
            print(f"     no slug worked\n")
        results.append((row, (locale, slug) if found else None))

    hits = [(row, found) for row, found in results if found]
    misses = [row for row, found in results if not found]

    print(f"\n=== summary ===")
    print(f"  hits:   {len(hits)}")
    print(f"  misses: {len(misses)}")

    if hits:
        print("\n=== updates that will be applied ===")
        for row, (locale, slug) in hits:
            m = WORKDAY_HOST_RE.match(row["official_careers_url"])
            host = m.group("host")  # type: ignore[union-attr]
            print(f"  #{row['id']:>3} {row['company_name']}: -> https://{host}/{locale}/{slug}")

    if not args.apply:
        print("\n(dry-run) re-run with --apply to persist and re-probe.")
        return 0

    for row, (locale, slug) in hits:
        m = WORKDAY_HOST_RE.match(row["official_careers_url"])
        host = m.group("host")  # type: ignore[union-attr]
        new_url = f"https://{host}/{locale}/{slug}"
        store._request(  # type: ignore[attr-defined]
            "PATCH", "companies",
            params={"id": f"eq.{row['id']}"},
            json_body={"official_careers_url": new_url},
            headers={"Prefer": "return=minimal"},
        )
    print(f"\npatched {len(hits)} company row(s). Now re-probe with "
          f"`python -m scripts.probe_all --apply` to refresh the jobpilot_* flags.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
