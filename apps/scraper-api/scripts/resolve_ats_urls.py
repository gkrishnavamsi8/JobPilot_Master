"""Bulk-resolver: figure out each company's real ATS URL + platform.

Runs a series of probes against every ``companies`` row and prints a plan of
proposed changes (or applies them with ``--apply``). The goal is to leave
``official_careers_url`` pointing at a URL our scrapers can actually use:

- For **Workday** rows, that means the tenant/site page
  ``https://<tenant>.wdN.myworkdayjobs.com/<locale>/<Site>`` (or the CXS API
  endpoint), verified by hitting ``/wday/cxs/.../jobs`` and expecting
  200 or 303.
- For other ATSes (Greenhouse, Lever, SmartRecruiters, iCIMS, Phenom, etc.)
  we detect the platform from the resolved URL and update ``ats_platform``
  accordingly.

Discovery strategies, in order:

1. Direct parse of the stored URL.
2. HEAD + redirect chase (many vanity domains just redirect to Workday).
3. GET the landing page and scan the HTML for a Workday URL or a well-known
   ATS host substring.
4. Guess common Workday tenant patterns:
   ``<slug>.wd{1..12}.myworkdayjobs.com/en-US/<one of a small set of sites>``
   where ``<slug>`` is derived from company name / domain.

Usage
-----
    .venv/bin/python -m scripts.resolve_ats_urls              # dry-run
    .venv/bin/python -m scripts.resolve_ats_urls --apply       # write changes
    .venv/bin/python -m scripts.resolve_ats_urls --only 88 121 # limit to ids
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any, Iterable
from urllib.parse import urlparse

from dotenv import load_dotenv
import requests

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.store import get_store  # noqa: E402
from src.ats.workday import _parse_workday_url  # noqa: E402

log = logging.getLogger("resolver")

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

# Host substring -> normalised platform label (matches src.ats registry names).
ATS_HOST_HINTS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\.myworkdayjobs\.com|\.myworkdaysite\.com"), "workday"),
    (re.compile(r"\.greenhouse\.io|boards\.greenhouse\.io"),   "greenhouse"),
    (re.compile(r"\.lever\.co|jobs\.lever\.co"),               "lever"),
    (re.compile(r"\.icims\.com|careers-.*\.icims\.com"),       "icims"),
    (re.compile(r"\.smartrecruiters\.com|careers\.smartrecruiters"), "smartrecruiters"),
    (re.compile(r"successfactors\.com|sfsuccessfactors|jobs\.sap\.com"), "successfactors"),
    (re.compile(r"taleo\.net|taleo\.com|tal\.net"),            "taleo"),
    (re.compile(r"phenompeople\.com|phenom\..*|/careers-home/"), "phenompeople"),
    (re.compile(r"ashbyhq\.com|jobs\.ashbyhq\.com"),           "ashby"),
    (re.compile(r"eightfold\.ai"),                             "eightfold"),
    (re.compile(r"jobvite\.com"),                              "jobvite"),
    # AstraZeneca is the only TalentBrew site we currently have a plugin for.
    (re.compile(r"careers\.astrazeneca\.com"),                 "astrazeneca"),
    # Everything else that looks like TalentBrew (host or JS include) - accurate
    # label, but no plugin registered yet so the UI will show unsupported.
    (re.compile(r"talentbrew"),                                "talentbrew"),
]

# Common Workday site slugs we've seen across large employers.
GUESS_SITES = [
    "External", "external", "Careers", "careers", "Careers_External",
    "External_Careers", "External_Career_Site", "ExternalCareerSite",
    "at_", "search", "Career", "AllOpenPositions", "JobBoard",
]
GUESS_PODS = [1, 3, 5, 10, 12, 2]


def _slug_from_name(name: str) -> list[str]:
    """Return plausible Workday tenant slugs derived from a company name."""
    s = re.sub(r"[^a-z0-9]+", "", name.lower())
    variants = {s}
    # Try dropping common suffixes.
    for suffix in ("inc", "corp", "company", "ltd", "plc", "gmbh", "holdings"):
        if s.endswith(suffix):
            variants.add(s[: -len(suffix)])
    return sorted(variants)


def _hosts_from_domain(domain: str | None) -> list[str]:
    """Extract a slug from the company's stored domain (if it's a URL)."""
    if not domain:
        return []
    parsed = urlparse(domain if "://" in domain else f"https://{domain}")
    host = parsed.netloc or parsed.path
    if not host:
        return []
    parts = host.split(".")
    if len(parts) >= 2:
        return [parts[-2]]
    return [parts[0]]


@dataclass
class Probe:
    workday_ok: bool = False
    workday_url: str | None = None
    workday_cxs_status: int | None = None
    detected_platform: str | None = None
    final_url: str | None = None
    notes: list[str] = field(default_factory=list)


def _detect_platform(url: str | None, extra_text: str = "") -> str | None:
    if not url and not extra_text:
        return None
    hay = f"{url or ''}\n{extra_text}"
    for pat, name in ATS_HOST_HINTS:
        if pat.search(hay):
            return name
    return None


def _workday_cxs_ok(session: requests.Session, workday_url: str) -> tuple[bool, int]:
    """Verify a candidate Workday tenant/site actually serves the CXS API.

    Returns (ok, status). We treat only ``200`` as conclusive because
    ``303`` can mean either "session-cookie required" (tenant exists) or
    "pod in maintenance" (tenant may not exist). Distinguishing the two
    reliably means inspecting the redirect target, which we do below.
    """
    parts = _parse_workday_url(workday_url)
    if not parts:
        return False, 0
    cxs_url = f"https://{parts['host']}/wday/cxs/{parts['tenant']}/{parts['site']}/jobs"
    try:
        r = session.post(
            cxs_url,
            json={"appliedFacets": {}, "limit": 1, "offset": 0, "searchText": ""},
            headers={"Accept": "application/json"},
            timeout=15,
            allow_redirects=False,
        )
    except requests.RequestException:
        return False, 0

    if r.status_code == 200:
        return True, 200
    if r.status_code == 303:
        loc = (r.headers.get("Location") or "").lower()
        if "community.workday.com/maintenance" in loc:
            return False, 303  # pod in maintenance - can't confirm tenant
        return True, 303  # legitimate session-init redirect
    return False, r.status_code


def _direct_workday(url: str | None, session: requests.Session, probe: Probe) -> str | None:
    if not url:
        return None
    if _parse_workday_url(url):
        ok, status = _workday_cxs_ok(session, url)
        probe.workday_cxs_status = status
        if ok:
            probe.notes.append(f"direct-parse ok (cxs={status})")
            return url
        probe.notes.append(f"direct-parse but cxs failed (status={status})")
    return None


def _redirect_chase(url: str | None, session: requests.Session, probe: Probe) -> str | None:
    if not url:
        return None
    try:
        r = session.head(url, allow_redirects=True, timeout=15,
                         headers={"User-Agent": UA})
        probe.final_url = r.url
        if r.url and _parse_workday_url(r.url):
            ok, status = _workday_cxs_ok(session, r.url)
            probe.workday_cxs_status = status
            if ok:
                probe.notes.append(f"redirect->workday {r.url} (cxs={status})")
                return r.url
    except requests.RequestException as e:
        probe.notes.append(f"HEAD failed: {e}")
    return None


def _html_scan(url: str | None, session: requests.Session, probe: Probe) -> tuple[str | None, str | None]:
    """Return (workday_url, detected_platform) by scanning the landing page HTML."""
    if not url:
        return None, None
    try:
        r = session.get(url, allow_redirects=True, timeout=20,
                        headers={"User-Agent": UA, "Accept": "text/html"})
        probe.final_url = r.url
        body = r.text or ""
    except requests.RequestException as e:
        probe.notes.append(f"GET failed: {e}")
        return None, None

    m = re.search(
        r"https?://[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com/[a-zA-Z0-9_\-/]+",
        body,
    )
    if m:
        candidate = m.group(0)
        ok, status = _workday_cxs_ok(session, candidate)
        probe.workday_cxs_status = status
        if ok:
            probe.notes.append(f"html-scan workday {candidate} (cxs={status})")
            return candidate, "workday"

    # Fall back to hint-based platform detection on final URL + body substring.
    plat = _detect_platform(r.url, body[:5000])
    if plat and plat != "workday":
        probe.notes.append(f"html-scan platform={plat} via final_url={r.url}")
        return None, plat
    return None, None


def _guess_workday(company_name: str, domain: str | None,
                   session: requests.Session, probe: Probe) -> str | None:
    """Brute-force common tenant/site combos for large employers."""
    slugs = set(_slug_from_name(company_name)) | set(_hosts_from_domain(domain))
    slugs = {s for s in slugs if s and len(s) >= 3}
    for slug in slugs:
        cap = slug.capitalize()
        upper = slug.upper()
        # Sites we always try, plus a few derived from the tenant slug (many
        # employers name their site "<Company>_Careers", "<Company>", etc.).
        sites_ordered = list(GUESS_SITES) + [
            f"{cap}_Careers", f"{cap}Careers", f"{cap}_External",
            cap, upper, f"{cap}_Careers_External",
        ]
        for pod in GUESS_PODS:
            host = f"{slug}.wd{pod}.myworkdayjobs.com"
            for site in sites_ordered:
                site_url = f"https://{host}/en-US/{site}"
                ok, status = _workday_cxs_ok(session, site_url)
                if ok:
                    probe.workday_cxs_status = status
                    probe.notes.append(f"guessed {site_url} (cxs={status})")
                    return site_url
    return None


def resolve_company(row: dict[str, Any], session: requests.Session) -> Probe:
    probe = Probe()
    name = row.get("company_name") or ""
    url = row.get("official_careers_url") or ""
    domain = row.get("domain")

    # 1. Direct
    if hit := _direct_workday(url, session, probe):
        probe.workday_ok = True
        probe.workday_url = hit
        probe.detected_platform = "workday"
        return probe

    # 2. Redirect chase
    if hit := _redirect_chase(url, session, probe):
        probe.workday_ok = True
        probe.workday_url = hit
        probe.detected_platform = "workday"
        return probe

    # 3. HTML scan (returns either a workday URL or a detected non-workday platform)
    wd_url, other_plat = _html_scan(url, session, probe)
    if wd_url:
        probe.workday_ok = True
        probe.workday_url = wd_url
        probe.detected_platform = "workday"
        return probe
    if other_plat:
        probe.detected_platform = other_plat
        return probe

    # 4. Guess tenant patterns (only if the row was tagged as Workday)
    if (row.get("ats_platform") or "").lower() == "workday":
        if hit := _guess_workday(name, domain, session, probe):
            probe.workday_ok = True
            probe.workday_url = hit
            probe.detected_platform = "workday"
            return probe

    return probe


# ------------------------------------------------------------------ main


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--apply", action="store_true",
                    help="Actually PATCH rows in Supabase (default: dry-run).")
    ap.add_argument("--only", type=int, nargs="+", default=None,
                    help="Restrict to specific company IDs.")
    ap.add_argument("--include-custom", action="store_true",
                    help="Also probe rows with ats_platform=Custom.")
    ap.add_argument("--concurrency", type=int, default=8)
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(levelname)s %(message)s",
    )

    store = get_store()
    # Pull all Workday rows (and optionally Custom rows) directly via the store.
    filters: dict[str, Any] = {"select": "*", "limit": 500}
    if args.only:
        # Postgrest 'in' filter takes a comma-list.
        filters["id"] = f"in.({','.join(map(str, args.only))})"
    else:
        wanted = ["Workday"]
        if args.include_custom:
            wanted.append("Custom")
        filters["ats_platform"] = f"in.({','.join(wanted)})"
    resp = store._request("GET", "companies", params=filters)  # type: ignore[attr-defined]
    rows = resp.json()

    log.info("Probing %d companies", len(rows))

    session = requests.Session()
    session.headers["User-Agent"] = UA

    plans: list[tuple[dict, Probe]] = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as ex:
        futures = {ex.submit(resolve_company, row, session): row for row in rows}
        for fut in as_completed(futures):
            row = futures[fut]
            probe = fut.result()
            plans.append((row, probe))

    plans.sort(key=lambda p: p[0]["id"])

    # Build change list.
    changes: list[dict] = []
    unresolved: list[dict] = []
    for row, probe in plans:
        current_url = row.get("official_careers_url") or ""
        current_plat = row.get("ats_platform") or ""

        new_url: str | None = None
        new_plat: str | None = None

        if probe.workday_ok and probe.workday_url and probe.workday_url != current_url:
            new_url = probe.workday_url
            new_plat = "Workday"
        elif probe.detected_platform and probe.detected_platform != "workday":
            # Only correct the label; leave URL alone (we don't have a specific one).
            expected_label = probe.detected_platform
            if expected_label.lower() != current_plat.lower():
                new_plat = expected_label

        if new_url or new_plat:
            changes.append({
                "id": row["id"], "name": row["company_name"],
                "old_url": current_url, "new_url": new_url,
                "old_platform": current_plat, "new_platform": new_plat,
                "notes": probe.notes,
            })
        elif current_plat.lower() == "workday" and not probe.workday_ok:
            unresolved.append({
                "id": row["id"], "name": row["company_name"],
                "url": current_url, "notes": probe.notes,
            })

    print(f"\n=== Proposed changes ({len(changes)}) ===")
    for c in changes:
        print(f"  #{c['id']:>3} {c['name']}")
        if c["new_url"]:
            print(f"     url:      {c['old_url']}")
            print(f"          ->  {c['new_url']}")
        if c["new_platform"]:
            print(f"     platform: {c['old_platform']} -> {c['new_platform']}")
        if c["notes"]:
            print(f"     notes:    {c['notes'][-1]}")

    print(f"\n=== Unresolved Workday rows ({len(unresolved)}) ===")
    for u in unresolved:
        print(f"  #{u['id']:>3} {u['name']} :: {u['url']}")
        for n in u["notes"][-2:]:
            print(f"       ! {n}")

    if not args.apply:
        print("\n(dry-run) re-run with --apply to persist these.")
        return 0

    print(f"\nApplying {len(changes)} update(s) to Supabase...")
    for c in changes:
        patch: dict[str, Any] = {}
        if c["new_url"]:
            patch["official_careers_url"] = c["new_url"]
        if c["new_platform"]:
            patch["ats_platform"] = c["new_platform"]
        store._request(  # type: ignore[attr-defined]
            "PATCH", "companies",
            params={"id": f"eq.{c['id']}"},
            json_body=patch,
            headers={"Prefer": "return=minimal"},
        )
        print(f"  patched #{c['id']} {c['name']} -> {patch}")

    print("done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
