"""Full-scrape every company currently marked ``jobpilot_supported = true``.

Uses the same code path as the FastAPI ``/scrape`` endpoint (``server.tasks.
start_run``) so results land in ``scrape_runs`` and ``scraped_jobs``
identically to a UI-triggered run - just fired for the whole supported set.

Usage
-----
    .venv/bin/python -m scripts.scrape_all_supported            # all dates
    .venv/bin/python -m scripts.scrape_all_supported --today     # today only
    .venv/bin/python -m scripts.scrape_all_supported --max-pages 20
    .venv/bin/python -m scripts.scrape_all_supported --only 121,122
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime

from dotenv import load_dotenv
from zoneinfo import ZoneInfo

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.companies import _normalise_platform  # noqa: E402
from server.store import get_store  # noqa: E402
from server.tasks import start_run  # noqa: E402
from src.models import SearchFilters  # noqa: E402

log = logging.getLogger("scrape_all_supported")


def _today() -> "datetime":
    tz_name = os.getenv("SCRAPE_TZ", "UTC")
    try:
        return datetime.now(ZoneInfo(tz_name))
    except Exception:  # noqa: BLE001
        return datetime.utcnow()


def _fmt_hms(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    if m:
        return f"{m}m{s:02d}s"
    return f"{s}s"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--today", action="store_true",
                    help="Filter to today (SCRAPE_TZ). Default: no date filter.")
    ap.add_argument("--max-pages", type=int, default=None,
                    help="Cap listing pages per company (default: no cap).")
    ap.add_argument("--max-workers", type=int, default=8,
                    help="Detail-fetch concurrency per scrape (default: 8).")
    ap.add_argument("--only", type=str, default=None,
                    help="Comma-separated company ids to include (default: all supported).")
    ap.add_argument("--poll", type=float, default=3.0,
                    help="Seconds between progress prints (default: 3).")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s %(message)s",
    )

    store = get_store()
    resp = store._request(  # type: ignore[attr-defined]
        "GET", "companies",
        params={
            "select": "id,company_name,ats_platform,official_careers_url,"
                      "jobpilot_supported,jobpilot_status",
            "jobpilot_supported": "eq.true",
            "order": "id.asc",
        },
    )
    rows = resp.json()

    only_ids = {s.strip() for s in (args.only or "").split(",") if s.strip()}
    if only_ids:
        rows = [r for r in rows if str(r["id"]) in only_ids]

    if not rows:
        print("No companies to scrape. Run scripts.probe_all --apply first "
              "so jobpilot_supported=true is populated.")
        return 1

    date_exact = _today().date() if args.today else None

    print(f"Kicking off full scrapes for {len(rows)} companies "
          f"(date={date_exact or 'ALL'}, max_pages={args.max_pages or 'unlimited'}, "
          f"max_workers={args.max_workers}).\n")

    states = []
    for row in rows:
        plugin = _normalise_platform(
            row.get("ats_platform"), row.get("official_careers_url"),
        )
        filters = SearchFilters(
            date_exact=date_exact,
            max_pages=args.max_pages,
            max_workers=args.max_workers,
        )
        state = start_run(
            company_id=str(row["id"]),
            company_name=row.get("company_name"),
            platform=plugin,
            filters=filters,
        )
        states.append(state)
        print(f"  queued  {plugin:<11} #{row['id']:>3}  {row['company_name']}  run_id={state.run_id}")

    print(f"\n{len(states)} run(s) queued. Waiting for all to finish...\n")
    start_ts = time.monotonic()

    printed_final = set()
    last_print = 0.0
    while True:
        now = time.monotonic()
        done = 0
        running = 0
        # Print a live status every --poll seconds.
        if now - last_print >= args.poll:
            last_print = now
            active_lines: list[str] = []
            for st in states:
                snap = st.snapshot()
                status = snap["status"]
                if status in ("succeeded", "failed"):
                    done += 1
                    if snap["id"] not in printed_final:
                        printed_final.add(snap["id"])
                        marker = "OK  " if status == "succeeded" else "FAIL"
                        err = snap.get("error_message") or ""
                        active_lines.append(
                            f"  {marker} {snap['platform']:<11} #{snap['company_id']:>3} "
                            f"{(snap['company_name'] or '?')[:26]:<26} "
                            f"stubs={snap['stubs_seen']:<4} matched={snap['matched']:<4} "
                            f"errs={snap['errors']:<3}"
                            + (f"  {err[:120]}" if err else "")
                        )
                else:
                    running += 1
            for line in active_lines:
                print(line)
            elapsed = _fmt_hms(now - start_ts)
            print(f"  ... elapsed={elapsed} running={running} done={done}/{len(states)}",
                  flush=True)

        # Break when everything is terminal.
        if all(st.snapshot()["status"] in ("succeeded", "failed") for st in states):
            break
        time.sleep(1.0)

    total_matched = sum(st.snapshot()["matched"] for st in states)
    total_stubs = sum(st.snapshot()["stubs_seen"] for st in states)
    total_errs = sum(st.snapshot()["errors"] for st in states)
    fails = [st for st in states if st.snapshot()["status"] == "failed"]

    print(f"\n=== summary ===")
    print(f"  runs      : {len(states)} ({len(states) - len(fails)} succeeded, {len(fails)} failed)")
    print(f"  stubs seen: {total_stubs}")
    print(f"  matched   : {total_matched} (upserted into scraped_jobs)")
    print(f"  errors    : {total_errs}")
    print(f"  elapsed   : {_fmt_hms(time.monotonic() - start_ts)}")

    if fails:
        print("\n=== failures ===")
        for st in fails:
            snap = st.snapshot()
            print(f"  #{snap['company_id']:>3} {snap['company_name']}: {snap.get('error_message')}")

    return 0 if not fails else 2


if __name__ == "__main__":
    sys.exit(main())
