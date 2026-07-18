"""Compute + persist ``jobpilot_supported`` / ``jobpilot_status`` per company.

The same logic drives ``supported`` on the ``/api/companies`` response - we
just mirror it into the ``companies`` table so it's filterable from SQL,
Supabase Studio, or a spreadsheet.

Usage
-----
    .venv/bin/python -m scripts.mark_supported            # dry-run
    .venv/bin/python -m scripts.mark_supported --apply     # persist
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from collections import Counter
from typing import Any

from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.companies import _normalise_platform  # noqa: E402
from server.store import get_store  # noqa: E402
from src.ats import list_platforms  # noqa: E402

log = logging.getLogger("mark_supported")


# Recognised free-text platform labels we'll surface in ``jobpilot_status``,
# even when we don't have a plugin for them. Keeps the reason human-readable.
_KNOWN_ATS = {
    "workday", "astrazeneca", "greenhouse", "lever", "smartrecruiters",
    "icims", "taleo", "successfactors", "sfsuccessfactors", "phenompeople",
    "phenom", "ashby", "ashbyhq", "recruitee", "workable", "eightfold",
    "jobvite", "talentbrew",
}


def compute_verdict(row: dict[str, Any], plugins: set[str]) -> tuple[bool, str]:
    """Return (supported, status_reason) for one company row.

    Rules:

    * Missing URL -> ``no careers URL``.
    * URL host maps to a registered plugin -> supported (this is the strongest
      signal; wins even if ``ats_platform`` disagrees).
    * ``ats_platform`` alias resolves to a registered plugin -> supported.
    * Otherwise unsupported, with the reason mentioning either the detected
      platform (via URL or label) or "unknown / custom".
    """
    url = (row.get("official_careers_url") or "").strip()
    raw = (row.get("ats_platform") or "").strip()
    raw_norm = raw.lower().replace(" ", "").replace("_", "").replace("-", "")

    if not url:
        return False, "no careers URL"

    # Uses same detection logic as /api/companies (URL is authoritative when
    # it matches a known host).
    plugin = _normalise_platform(raw, url)

    if plugin and plugin in plugins:
        return True, f"supported: {plugin} plugin"

    # A named platform we don't have a plugin for.
    if plugin and plugin not in plugins:
        return False, f"no plugin registered for '{plugin}'"

    if raw_norm in _KNOWN_ATS:
        return False, f"no plugin registered for '{raw_norm}'"

    if raw_norm in {"", "custom", "unknown"}:
        return False, "custom / unknown ATS (no plugin)"

    return False, f"unrecognised platform '{raw}'"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--apply", action="store_true",
                    help="Persist the verdicts (default: dry-run).")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING,
                        format="%(levelname)s %(message)s")

    store = get_store()
    plugins = set(list_platforms())
    log.info("registered plugins: %s", sorted(plugins))

    resp = store._request(  # type: ignore[attr-defined]
        "GET", "companies",
        params={"select": "id,company_name,ats_platform,official_careers_url,"
                          "jobpilot_supported,jobpilot_status",
                "order": "id.asc"},
    )
    rows = resp.json()
    print(f"Probing {len(rows)} companies...")

    supported_rows: list[dict] = []
    unsupported_rows: list[dict] = []
    unchanged = 0
    status_counter: Counter[str] = Counter()

    for row in rows:
        supported, status = compute_verdict(row, plugins)
        status_counter[status] += 1
        row_out = {
            "id": row["id"], "name": row["company_name"],
            "supported": supported, "status": status,
            "old_supported": row.get("jobpilot_supported"),
            "old_status": row.get("jobpilot_status"),
        }
        (supported_rows if supported else unsupported_rows).append(row_out)
        if (row.get("jobpilot_supported") == supported
                and row.get("jobpilot_status") == status):
            unchanged += 1

    print(f"\n=== SUPPORTED ({len(supported_rows)}) ===")
    for r in supported_rows:
        print(f"  #{r['id']:>3} {r['name']:<32}  {r['status']}")

    print(f"\n=== UNSUPPORTED ({len(unsupported_rows)}) ===")
    by_status: dict[str, list[dict]] = {}
    for r in unsupported_rows:
        by_status.setdefault(r["status"], []).append(r)
    for status in sorted(by_status):
        entries = by_status[status]
        print(f"  {status}: {len(entries)}")
        for r in entries[:5]:
            print(f"     #{r['id']:>3} {r['name']}")
        if len(entries) > 5:
            print(f"     ... +{len(entries) - 5} more")

    print("\n=== summary ===")
    for status, cnt in status_counter.most_common():
        print(f"  {cnt:>3}  {status}")
    print(f"  {unchanged} row(s) already in this exact state (no-op on apply).")

    if not args.apply:
        print("\n(dry-run) re-run with --apply to persist.")
        return 0

    print(f"\nApplying {len(rows) - unchanged} update(s) to Supabase...")
    all_rows = supported_rows + unsupported_rows
    to_apply = [
        r for r in all_rows
        if r["supported"] != r["old_supported"] or r["status"] != r["old_status"]
    ]
    for r in to_apply:
        store._request(  # type: ignore[attr-defined]
            "PATCH", "companies",
            params={"id": f"eq.{r['id']}"},
            json_body={
                "jobpilot_supported": r["supported"],
                "jobpilot_status":    r["status"],
            },
            headers={"Prefer": "return=minimal"},
        )
    print(f"done. patched {len(to_apply)} row(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
