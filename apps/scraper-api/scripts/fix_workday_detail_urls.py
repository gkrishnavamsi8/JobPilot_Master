"""Backfill ``scraped_jobs.detail_url`` for previously-scraped Workday rows.

Old scrapes stored a bare URL:
    https://<tenant>.wdN.myworkdayjobs.com/job/<location>/<slug>

Workday's edge 404s that shape in a browser - the public URL needs the
``/<locale>/<Site>`` prefix (which the CXS API doesn't). This script
resolves the correct prefix per company using the same ``WorkdayConfig``
resolver the scraper uses, then bulk-patches each affected row.

Usage
-----
    .venv/bin/python -m scripts.fix_workday_detail_urls            # dry-run
    .venv/bin/python -m scripts.fix_workday_detail_urls --apply
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sys
from collections import defaultdict
from typing import Any

from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.store import get_store  # noqa: E402
from src.ats.workday import WorkdayConfig, WorkdayConfigError  # noqa: E402
from src.http_client import build_session  # noqa: E402

log = logging.getLogger("fix_workday_detail_urls")

# ``https://<tenant>.wdN.myworkdayjobs.com/job/...`` - old (broken) shape.
BAD_URL_RE = re.compile(
    r"^https?://([a-z0-9-]+\.wd\d+\.myworkdayjobs\.com)(/job/.+)$",
    re.IGNORECASE,
)


def _fetch_all_workday_urls(store) -> list[dict[str, Any]]:
    """Page through ``scraped_jobs`` collecting every Workday row.

    Supabase caps responses at ~1000 rows, so we paginate. Returns the raw
    rows (company_id, source, job_id, detail_url).
    """
    rows: list[dict[str, Any]] = []
    batch = 1000
    offset = 0
    while True:
        resp = store._request(  # type: ignore[attr-defined]
            "GET", "scraped_jobs",
            params={
                "select": "company_id,source,job_id,detail_url",
                "source": "eq.workday",
                "order":  "company_id.asc,job_id.asc",
                "limit":  batch,
                "offset": offset,
            },
        )
        page = resp.json()
        if not page:
            break
        rows.extend(page)
        if len(page) < batch:
            break
        offset += batch
    return rows


def _resolve_prefixes(store, company_ids: list[str], session) -> dict[str, str]:
    """Map each company_id -> ``/<locale>/<Site>`` prefix to inject.

    Falls back to logging + skipping the company if resolution fails.
    """
    prefixes: dict[str, str] = {}
    resp = store._request(  # type: ignore[attr-defined]
        "GET", "companies",
        params={
            "select": "id,company_name,official_careers_url",
            "id":     f"in.({','.join(str(c) for c in company_ids)})",
        },
    )
    companies = {str(r["id"]): r for r in resp.json()}

    for cid in company_ids:
        row = companies.get(cid)
        if not row or not row.get("official_careers_url"):
            log.warning("company %s has no careers_url - skipping", cid)
            continue
        try:
            cfg = WorkdayConfig.from_careers_url(
                row["official_careers_url"], session=session,
            )
            prefixes[cid] = f"/{cfg.locale}/{cfg.site}"
        except WorkdayConfigError as exc:
            log.warning("company %s (%s): could not resolve Workday config: %s",
                        cid, row.get("company_name"), exc)
    return prefixes


def _fix_url(url: str, prefix: str) -> str | None:
    """Return the corrected URL, or ``None`` if the URL doesn't need fixing."""
    m = BAD_URL_RE.match(url or "")
    if not m:
        return None
    host, job_path = m.group(1), m.group(2)
    return f"https://{host}{prefix}{job_path}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--apply", action="store_true",
                    help="Persist the corrected URLs (default: dry-run).")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s %(message)s",
    )

    store = get_store()
    session = build_session()

    print("Loading Workday rows from scraped_jobs...")
    rows = _fetch_all_workday_urls(store)
    print(f"  {len(rows)} row(s) with source=workday")

    by_company: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_company[str(r["company_id"])].append(r)

    print("\nResolving locale/Site prefix per company:")
    prefixes = _resolve_prefixes(store, list(by_company), session)
    for cid, prefix in sorted(prefixes.items()):
        print(f"  company #{cid:>3}: prefix={prefix}  ({len(by_company[cid])} rows)")
    missing = [c for c in by_company if c not in prefixes]
    if missing:
        print(f"\nSkipping {len(missing)} company/companies with unresolved prefixes:")
        for c in missing:
            print(f"  #{c}: {len(by_company[c])} row(s) untouched")

    to_patch: list[tuple[str, str, str, str]] = []  # (cid, job_id, old, new)
    unchanged = 0
    for cid, prefix in prefixes.items():
        for r in by_company[cid]:
            new = _fix_url(r.get("detail_url") or "", prefix)
            if new and new != r["detail_url"]:
                to_patch.append((cid, r["job_id"], r["detail_url"], new))
            else:
                unchanged += 1

    print(f"\n{len(to_patch)} URL(s) to fix, {unchanged} already correct or unmatched.")
    for cid, job_id, old, new in to_patch[:5]:
        print(f"  #{cid} {job_id}\n     OLD: {old}\n     NEW: {new}")
    if len(to_patch) > 5:
        print(f"  ... +{len(to_patch) - 5} more")

    if not args.apply:
        print("\n(dry-run) re-run with --apply to persist.")
        return 0

    # We can't bulk-upsert cleanly (title/run_id are NOT NULL and Postgres
    # validates the INSERT side of ON CONFLICT even when the UPDATE branch
    # fires), so we PATCH each row via its PK and parallelise.
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _patch_one(cid: str, job_id: str, new: str) -> None:
        store._request(  # type: ignore[attr-defined]
            "PATCH", "scraped_jobs",
            params={
                "company_id": f"eq.{cid}",
                "source":     "eq.workday",
                "job_id":     f"eq.{job_id}",
            },
            json_body={"detail_url": new},
            headers={"Prefer": "return=minimal"},
        )

    workers = 16
    print(f"\nPatching {len(to_patch)} row(s) with {workers} concurrent workers...")
    done = 0
    failed = 0
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="patch") as pool:
        futures = [
            pool.submit(_patch_one, cid, job_id, new)
            for (cid, job_id, _old, new) in to_patch
        ]
        for fut in as_completed(futures):
            try:
                fut.result()
                done += 1
            except Exception as exc:  # noqa: BLE001
                failed += 1
                log.warning("patch failed: %s", exc)
            if (done + failed) % 500 == 0:
                print(f"  {done + failed}/{len(to_patch)}  ok={done}  failed={failed}")
    print(f"done. patched {done} row(s), {failed} failure(s).")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
