"""Probe every "supposedly scrapable" company and record who actually works.

Strategy
--------
For each company whose ``ats_platform`` maps to a registered plugin, we run a
*listing-only* scrape (page 1, no detail fetches, ``max_pages=1``,
``max_workers=1``). If the source returns any postings, the company works
today; otherwise the failure reason is captured. Then, when the
``jobpilot_supported`` / ``jobpilot_status`` columns exist, we PATCH those
columns with the empirical verdict.

Usage
-----
    .venv/bin/python -m scripts.probe_all              # dry-run report
    .venv/bin/python -m scripts.probe_all --apply       # persist verdicts
    .venv/bin/python -m scripts.probe_all --only 5,42   # subset by id
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.companies import _normalise_platform  # noqa: E402
from server.store import PostgrestError, get_store  # noqa: E402
from src.ats import get_scraper, list_platforms  # noqa: E402
from src.http_client import build_session  # noqa: E402
from src.models import SearchFilters  # noqa: E402

log = logging.getLogger("probe_all")


def _row_to_company(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "name": row.get("company_name") or row.get("name"),
        "careers_url": row.get("official_careers_url"),
    }


def _probe_one(row: dict[str, Any], plugin: str) -> tuple[str, str]:
    """Run a listing-only scrape; return (status, message).

    ``status`` is one of:
      ``ok``      - source returned at least one posting
      ``empty``   - source returned zero postings (still counted as working)
      ``fail``    - request/parse/config error
    """
    company = _row_to_company(row)
    filters = SearchFilters(max_pages=1, max_workers=1, limit=10)

    scraper_cls = get_scraper(plugin)
    session = build_session()
    started = time.monotonic()
    try:
        with scraper_cls(session=session, company=company) as scraper:
            stubs, _pages = scraper.discover_stubs(filters)
        elapsed = time.monotonic() - started
        if stubs:
            return "ok", f"{len(stubs)} stub(s) in {elapsed:.1f}s"
        return "empty", f"0 stubs in {elapsed:.1f}s"
    except Exception as exc:  # noqa: BLE001 - want the full reason
        elapsed = time.monotonic() - started
        msg = str(exc)
        # Trim long tracebacks-in-message to keep the status column readable.
        first_line = msg.splitlines()[0] if msg else exc.__class__.__name__
        return "fail", f"{first_line[:180]} (after {elapsed:.1f}s)"
    finally:
        session.close()


def _decide_verdict(status: str, msg: str, plugin: str) -> tuple[bool, str]:
    if status == "ok":
        return True, f"probed ok: {plugin} plugin - {msg}"
    if status == "empty":
        return True, f"probed empty but plugin works: {plugin} - {msg}"
    return False, f"probe failed: {msg}"


def _maybe_patch(store, company_id: str, supported: bool, status_msg: str) -> str:
    """Attempt to PATCH the verdict; return "patched" or "column_missing"."""
    try:
        store._request(  # type: ignore[attr-defined]
            "PATCH", "companies",
            params={"id": f"eq.{company_id}"},
            json_body={
                "jobpilot_supported": supported,
                "jobpilot_status":    status_msg[:500],
            },
            headers={"Prefer": "return=minimal"},
        )
        return "patched"
    except PostgrestError as exc:
        # 400 -> column doesn't exist yet (DDL not applied).
        if "jobpilot" in str(exc).lower() or exc.status in (400, 404):
            return "column_missing"
        raise


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--apply", action="store_true",
                    help="Persist verdicts to jobpilot_supported/jobpilot_status.")
    ap.add_argument("--only", type=str, default=None,
                    help="Comma-separated company ids to probe (default: all supposedly-scrapable).")
    ap.add_argument("--concurrency", type=int, default=4,
                    help="How many companies to probe in parallel (default: 4).")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING,
                        format="%(levelname)s %(name)s %(message)s")

    store = get_store()
    plugins = set(list_platforms())
    print(f"registered plugins: {sorted(plugins)}\n")

    resp = store._request(  # type: ignore[attr-defined]
        "GET", "companies",
        params={"select": "id,company_name,ats_platform,official_careers_url",
                "order": "id.asc"},
    )
    rows: list[dict[str, Any]] = resp.json()

    only_ids = {s.strip() for s in (args.only or "").split(",") if s.strip()}

    # Restrict to rows whose static verdict says "scrapable" - no point probing
    # companies we know we can't hit.
    targets: list[tuple[dict[str, Any], str]] = []
    skipped_reasons: Counter[str] = Counter()
    for row in rows:
        if only_ids and str(row["id"]) not in only_ids:
            continue
        plugin = _normalise_platform(
            row.get("ats_platform"), row.get("official_careers_url"),
        )
        if not (plugin and plugin in plugins):
            skipped_reasons[f"no plugin for '{plugin or 'unknown'}'"] += 1
            continue
        targets.append((row, plugin))

    print(f"probing {len(targets)} companies (skipping {sum(skipped_reasons.values())} without a plugin)")
    for reason, n in skipped_reasons.most_common():
        print(f"  skip: {n:>3}  {reason}")
    print()

    results: list[tuple[dict, str, str, str]] = []  # (row, plugin, status, msg)
    with ThreadPoolExecutor(max_workers=max(1, args.concurrency),
                            thread_name_prefix="probe") as pool:
        futures = {
            pool.submit(_probe_one, row, plugin): (row, plugin)
            for row, plugin in targets
        }
        for i, fut in enumerate(as_completed(futures), 1):
            row, plugin = futures[fut]
            status, msg = fut.result()
            results.append((row, plugin, status, msg))
            marker = {"ok": "OK  ", "empty": "0/0 ", "fail": "FAIL"}[status]
            name = (row.get("company_name") or row.get("name") or "?")[:30]
            print(f"  [{i:>2}/{len(targets)}] {marker}  {plugin:<11} #{row['id']:>3}  {name:<30}  {msg}")

    ok_count = sum(1 for _, _, s, _ in results if s == "ok")
    empty_count = sum(1 for _, _, s, _ in results if s == "empty")
    fail_count = sum(1 for _, _, s, _ in results if s == "fail")
    print(f"\n=== summary ===")
    print(f"  OK       {ok_count:>3}")
    print(f"  EMPTY    {empty_count:>3}  (plugin fine, tenant had zero postings today)")
    print(f"  FAIL     {fail_count:>3}")

    print("\n=== failures (top 20) ===")
    fails = [r for r in results if r[2] == "fail"]
    for row, plugin, _, msg in fails[:20]:
        name = row.get("company_name") or row.get("name")
        print(f"  #{row['id']:>3} {plugin:<11} {name:<30}  {msg}")
    if len(fails) > 20:
        print(f"  ... +{len(fails) - 20} more")

    if not args.apply:
        print("\n(dry-run) re-run with --apply to persist verdicts to jobpilot_supported/jobpilot_status.")
        return 0

    print(f"\nPatching {len(results)} row(s)...")
    patched = 0
    column_missing = False
    for row, plugin, status, msg in results:
        supported, status_msg = _decide_verdict(status, msg, plugin)
        outcome = _maybe_patch(store, str(row["id"]), supported, status_msg)
        if outcome == "column_missing":
            column_missing = True
            break
        patched += 1

    if column_missing:
        print("\nColumns jobpilot_supported / jobpilot_status don't exist yet.")
        print("Apply db/schema.sql (the ALTER TABLE block near the bottom) in Supabase,")
        print("then re-run: `.venv/bin/python -m scripts.probe_all --apply`")
        return 2
    print(f"done. patched {patched} row(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
