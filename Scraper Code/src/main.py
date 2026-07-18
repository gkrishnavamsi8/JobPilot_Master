"""Command-line entry point.

Supports every ATS platform registered in :mod:`src.ats` and a shared set of
filter flags. Run ``python -m src.main --list-platforms`` to see what's wired.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dotenv import load_dotenv

from .db import ensure_schema, get_conn, upsert_jobs
from .excel_writer import write_jobs as write_excel
from .models import ScrapeResult, SearchFilters
from .scraper import list_platforms, run_platform

log = logging.getLogger("jobpilot")


def _today_local(tz_name: str) -> date:
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        log.warning("Unknown SCRAPE_TZ %r; falling back to system local date", tz_name)
        return datetime.now().date()
    return datetime.now(tz).date()


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def _parse_iso_date(value: str, flag: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise SystemExit(f"Invalid {flag} value {value!r}: {exc}")


def _build_arg_parser() -> argparse.ArgumentParser:
    platforms = list_platforms()
    parser = argparse.ArgumentParser(
        prog="jobpilot",
        description="Scrape job postings from any registered ATS and upsert them into PostgreSQL or Excel.",
    )

    parser.add_argument(
        "--platform",
        "-p",
        default=os.getenv("PLATFORM", "astrazeneca"),
        help=f"ATS platform to scrape (default: astrazeneca). Available: {', '.join(platforms) or '<none>'}",
    )
    parser.add_argument(
        "--list-platforms",
        action="store_true",
        help="List registered ATS platforms and exit.",
    )

    scope = parser.add_argument_group("date scope").add_mutually_exclusive_group()
    scope.add_argument("--today", action="store_true", help="Only jobs posted today in SCRAPE_TZ.")
    scope.add_argument("--date", metavar="YYYY-MM-DD", help="Only jobs posted on this exact date.")
    scope.add_argument("--all", action="store_true", help="No date filter (keep everything).")

    filt = parser.add_argument_group("filters")
    filt.add_argument("--keyword", "-k", help="Free-text keyword; pushed server-side when supported.")
    filt.add_argument("--location", "-l", help="Location substring (city, region, or country).")
    filt.add_argument("--country", help="Country substring match, e.g. 'United States'.")
    filt.add_argument("--employment-type", help="Employment type substring, e.g. 'Full time'.")
    filt.add_argument("--since", metavar="YYYY-MM-DD", help="Only jobs posted on or after this date.")
    filt.add_argument("--until", metavar="YYYY-MM-DD", help="Only jobs posted on or before this date.")
    filt.add_argument("--limit", type=int, help="Stop after this many matching jobs.")

    perf = parser.add_argument_group("performance")
    perf.add_argument("--max-workers", type=int, default=None, help="Concurrent detail fetches (default: MAX_WORKERS env or 8).")
    perf.add_argument("--max-pages", type=int, default=None, help="Cap listing pages scanned.")

    out = parser.add_argument_group("output")
    out.add_argument("--excel", metavar="PATH", help="Also write matching jobs to an .xlsx file.")
    out.add_argument("--dry-run", action="store_true", help="Skip PostgreSQL (Excel still writes if given).")
    out.add_argument("--no-db", action="store_true", help="Skip PostgreSQL even if configured.")

    parser.add_argument("-v", "--verbose", action="store_true", help="Enable DEBUG logging.")
    return parser


def _resolve_target_date(args: argparse.Namespace, tz_name: str) -> date | None:
    if args.all:
        return None
    if args.date:
        return _parse_iso_date(args.date, "--date")
    if args.today:
        return _today_local(tz_name)
    # Default when no scope flag is provided but a --since/--until range is:
    # skip the "today" default so ranges work naturally.
    if args.since or args.until:
        return None
    return _today_local(tz_name)


def _resolve_max_workers(cli_value: int | None) -> int:
    if cli_value is not None:
        return max(1, cli_value)
    env_workers = os.getenv("MAX_WORKERS")
    try:
        return max(1, int(env_workers)) if env_workers else 8
    except ValueError:
        log.warning("Invalid MAX_WORKERS=%r; using 8", env_workers)
        return 8


def _print_summary(result: ScrapeResult, filters: SearchFilters, dry_run: bool) -> None:
    scope_bits = []
    if filters.date_exact:
        scope_bits.append(f"date_exact={filters.date_exact.isoformat()}")
    if filters.date_from:
        scope_bits.append(f"since={filters.date_from.isoformat()}")
    if filters.date_to:
        scope_bits.append(f"until={filters.date_to.isoformat()}")
    if filters.keyword:
        scope_bits.append(f"keyword={filters.keyword!r}")
    if filters.location:
        scope_bits.append(f"location={filters.location!r}")
    if filters.country:
        scope_bits.append(f"country={filters.country!r}")
    if filters.employment_type:
        scope_bits.append(f"employment_type={filters.employment_type!r}")
    if filters.limit:
        scope_bits.append(f"limit={filters.limit}")
    scope = ", ".join(scope_bits) if scope_bits else "no filter"

    header = f"{result.platform} scrape summary ({scope})"
    print(header)
    print("=" * len(header))
    print(f"Listing pages scanned : {result.total_pages}")
    print(f"Job stubs seen        : {result.stubs_seen}")
    print(f"Detail pages fetched  : {result.details_fetched}")
    print(f"Detail fetch errors   : {result.detail_errors}")
    print(f"Matching jobs         : {len(result.jobs)}")
    print()

    if not result.jobs:
        return

    for job in sorted(result.jobs, key=lambda j: (j.date_posted or date.min, j.title), reverse=True):
        posted = job.date_posted.isoformat() if job.date_posted else "unknown"
        print(f"[{posted}] {job.title}")
        print(f"    {job.location or '-'}")
        print(f"    id={job.job_id}  {job.detail_url}")

    if dry_run:
        print("\n(dry-run: nothing written to PostgreSQL)")


def main(argv: list[str] | None = None) -> int:
    load_dotenv()

    parser = _build_arg_parser()
    args = parser.parse_args(argv)

    _configure_logging(args.verbose)

    if args.list_platforms:
        for name in list_platforms():
            print(name)
        return 0

    tz_name = os.getenv("SCRAPE_TZ", "UTC")

    filters = SearchFilters(
        keyword=args.keyword,
        location=args.location,
        country=args.country,
        employment_type=args.employment_type,
        date_exact=_resolve_target_date(args, tz_name),
        date_from=_parse_iso_date(args.since, "--since") if args.since else None,
        date_to=_parse_iso_date(args.until, "--until") if args.until else None,
        limit=args.limit,
        max_pages=args.max_pages,
        max_workers=_resolve_max_workers(args.max_workers),
    )

    # If the user asked for a range (--since / --until), don't ALSO impose the
    # default "today" exact-date filter (which would zero out results).
    if (args.since or args.until) and not (args.today or args.date):
        filters.date_exact = None

    log.info(
        "Scrape starting: platform=%s date_exact=%s since=%s until=%s dry_run=%s",
        args.platform,
        filters.date_exact.isoformat() if filters.date_exact else "-",
        filters.date_from.isoformat() if filters.date_from else "-",
        filters.date_to.isoformat() if filters.date_to else "-",
        args.dry_run,
    )

    result = run_platform(args.platform, filters)

    _print_summary(result, filters, args.dry_run)

    if args.excel:
        if result.jobs:
            path = write_excel(result.jobs, args.excel)
            log.info("Excel written: %s", path)
        else:
            log.info("No matching jobs to write to Excel.")

    if args.dry_run or args.no_db:
        return 0

    db_configured = bool(os.getenv("DATABASE_URL") or os.getenv("PGDATABASE"))
    if not db_configured:
        log.info(
            "No PostgreSQL connection configured (set DATABASE_URL or PG* vars); "
            "skipping DB write."
        )
        return 0

    if not result.jobs:
        log.info("No matching jobs to write to PostgreSQL.")
        return 0

    with get_conn() as conn:
        ensure_schema(conn)
        written = upsert_jobs(conn, result.jobs)
    log.info("Wrote %d job(s) to PostgreSQL.", written)
    return 0


if __name__ == "__main__":
    sys.exit(main())
