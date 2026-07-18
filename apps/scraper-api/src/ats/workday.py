"""Generic Workday careers scraper.

Almost every Workday-hosted portal exposes the same JSON API at
``<base>/wday/cxs/<tenant>/<site>/jobs``. Because the tenant/site combo varies
per employer (e.g. ``https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite``),
this scraper is *config-driven*: you tell it where to point via CLI flags or
environment variables and it does the rest.

Configuration precedence (highest first):

1. Constructor kwargs (used by tests / programmatic callers).
2. ``WORKDAY_BASE_URL`` env var - full URL up to the site slug, e.g.
   ``https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite``.
3. Individual env vars: ``WORKDAY_HOST``, ``WORKDAY_TENANT``, ``WORKDAY_LOCALE``
   (default ``en-US``), ``WORKDAY_SITE``.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any
from urllib.parse import urljoin, urlparse

from requests import Session

from ..http_client import DEFAULT_TIMEOUT, build_session
from ..models import JobDetail, JobStub, SearchFilters
from ..parser import parse_date, parse_human_date, strip_html
from .base import BaseAtsScraper
from .registry import register

log = logging.getLogger(__name__)

JOBS_PATH_TEMPLATE = "/wday/cxs/{tenant}/{site}/jobs"
# `externalPath` in the search response already starts with '/job/...' so the
# template only prefixes the CXS base and appends the path verbatim.
JOB_DETAIL_PATH_TEMPLATE = "/wday/cxs/{tenant}/{site}{path}"
PAGE_LIMIT = 20  # Workday CXS caps ``limit`` at 20 per request.

# Matches https://<tenant>.wdN.myworkdayjobs.com[/<locale>[/<site>]] (locale/site optional).
WORKDAY_URL_RE = re.compile(
    r"https?://(?P<tenant>[a-z0-9-]+)\.wd(?P<pod>\d+)\.myworkdayjobs\.com"
    r"(?:/(?:wday/cxs/[^/]+/(?P<cxs_site>[^/?#]+))"
    r"|/(?P<locale>[a-zA-Z-]{2,7})(?:/(?P<site>[^/?#]+))?)?",
    re.IGNORECASE,
)


def _parse_workday_url(url: str) -> dict[str, str] | None:
    """Extract tenant / locale / site from any Workday URL flavour.

    Handles both public URLs (``https://amd.wd5.myworkdayjobs.com/en-US/External``)
    and CXS API URLs embedded in page HTML
    (``https://amd.wd5.myworkdayjobs.com/wday/cxs/amd/External/jobs``).
    """
    m = WORKDAY_URL_RE.search(url)
    if not m:
        return None
    host = f"{m.group('tenant')}.wd{m.group('pod')}.myworkdayjobs.com"
    site = m.group("site") or m.group("cxs_site")
    if not site:
        return None
    return {
        "host": host,
        "tenant": m.group("tenant"),
        "locale": m.group("locale") or "en-US",
        "site": site,
    }


class WorkdayConfigError(RuntimeError):
    """Raised when the Workday scraper is invoked without a resolvable target URL."""


class WorkdayConfig:
    """Resolved Workday endpoint components."""

    def __init__(
        self,
        base_url: str | None = None,
        *,
        host: str | None = None,
        tenant: str | None = None,
        locale: str | None = None,
        site: str | None = None,
    ) -> None:
        self.host, self.tenant, self.locale, self.site = self._resolve(
            base_url=base_url, host=host, tenant=tenant, locale=locale, site=site,
        )
        self.base_url = f"https://{self.host}"
        self.jobs_url = urljoin(
            self.base_url,
            JOBS_PATH_TEMPLATE.format(tenant=self.tenant, site=self.site),
        )
        self.public_search_url = urljoin(
            self.base_url, f"/{self.locale}/{self.site}"
        )

    @classmethod
    def from_careers_url(
        cls,
        url: str,
        *,
        session: Session | None = None,
        max_redirects: int = 5,
    ) -> "WorkdayConfig":
        """Derive a :class:`WorkdayConfig` from a company's careers URL.

        Resolution order:

        1. If ``url`` itself points at ``<tenant>.wdN.myworkdayjobs.com``, use it.
        2. Otherwise HEAD the URL and follow redirects; check the final URL.
        3. Otherwise GET the URL and scan the HTML for any Workday URL
           (public or CXS API). Common on custom landing pages that embed a
           Workday iframe or link.

        Raises :class:`WorkdayConfigError` with a clear message if none work.
        """
        if not url:
            raise WorkdayConfigError("No careers_url set on this company.")

        # 1. Direct match on the given URL.
        parts = _parse_workday_url(url)
        if parts:
            log.info("workday: parsed URL directly -> %s", parts)
            return cls(host=parts["host"], tenant=parts["tenant"],
                       locale=parts["locale"], site=parts["site"])

        sess = session or build_session()
        # 2. HEAD + redirects.
        try:
            resp = sess.head(
                url, allow_redirects=True, timeout=DEFAULT_TIMEOUT,
                headers={"Accept": "*/*"},
            )
            final = resp.url
            if final and final != url:
                parts = _parse_workday_url(final)
                if parts:
                    log.info("workday: resolved via redirect -> %s (final=%s)", parts, final)
                    return cls(host=parts["host"], tenant=parts["tenant"],
                               locale=parts["locale"], site=parts["site"])
        except Exception as exc:  # noqa: BLE001
            log.debug("workday: HEAD probe failed for %s: %s", url, exc)

        # 3. GET + HTML scan for a Workday URL.
        try:
            resp = sess.get(
                url, allow_redirects=True, timeout=DEFAULT_TIMEOUT,
                headers={
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
            body = resp.text or ""
            parts = _parse_workday_url(body)
            if parts:
                log.info("workday: found embedded URL in HTML -> %s", parts)
                return cls(host=parts["host"], tenant=parts["tenant"],
                           locale=parts["locale"], site=parts["site"])
        except Exception as exc:  # noqa: BLE001
            log.debug("workday: GET probe failed for %s: %s", url, exc)

        raise WorkdayConfigError(
            f"Could not derive a Workday tenant from {url!r}. "
            "The site does not redirect to *.myworkdayjobs.com and no Workday URL is "
            "embedded in its HTML. Add the CXS URL directly (e.g. "
            "'https://<tenant>.wd5.myworkdayjobs.com/en-US/<Site>') in the "
            "company's careers URL, or configure WORKDAY_BASE_URL at process level."
        )

    @staticmethod
    def _resolve(
        *,
        base_url: str | None,
        host: str | None,
        tenant: str | None,
        locale: str | None,
        site: str | None,
    ) -> tuple[str, str, str, str]:
        base_url = base_url or os.getenv("WORKDAY_BASE_URL")
        if base_url:
            parsed = urlparse(base_url)
            if not parsed.netloc:
                raise WorkdayConfigError(f"Invalid WORKDAY_BASE_URL: {base_url!r}")
            path_parts = [p for p in parsed.path.split("/") if p]
            if len(path_parts) < 2:
                raise WorkdayConfigError(
                    "WORKDAY_BASE_URL must be like "
                    "'https://<tenant>.wdN.myworkdayjobs.com/<locale>/<site>'"
                )
            locale = locale or os.getenv("WORKDAY_LOCALE") or path_parts[0]
            site = site or os.getenv("WORKDAY_SITE") or path_parts[1]
            host = host or os.getenv("WORKDAY_HOST") or parsed.netloc
        else:
            host = host or os.getenv("WORKDAY_HOST")
            locale = locale or os.getenv("WORKDAY_LOCALE") or "en-US"
            site = site or os.getenv("WORKDAY_SITE")

        tenant = tenant or os.getenv("WORKDAY_TENANT")
        if not tenant and host:
            # Tenant is the first host label in <tenant>.wdN.myworkdayjobs.com.
            match = re.match(r"^([^.]+)\.wd\d+\.myworkdayjobs\.com$", host)
            if match:
                tenant = match.group(1)

        missing = [
            name
            for name, val in (
                ("WORKDAY_HOST/WORKDAY_BASE_URL", host),
                ("WORKDAY_TENANT", tenant),
                ("WORKDAY_SITE", site),
            )
            if not val
        ]
        if missing:
            raise WorkdayConfigError(
                "Workday scraper not configured. Missing: "
                + ", ".join(missing)
                + ". Set WORKDAY_BASE_URL or the individual WORKDAY_* env vars."
            )

        return host, tenant, locale, site  # type: ignore[return-value]


def _extract_location(posting: dict[str, Any]) -> tuple[str | None, str | None]:
    """Best-effort location extraction from a Workday job posting."""
    location = posting.get("locationsText") or posting.get("location")
    if isinstance(location, list):
        location = ", ".join(str(x) for x in location if x)

    bullet_fields = posting.get("bulletFields") or []
    if not location and bullet_fields:
        location = " | ".join(str(x) for x in bullet_fields if x)

    country = None
    if isinstance(location, str) and "," in location:
        country = location.rsplit(",", 1)[-1].strip() or None

    return (location.strip() if isinstance(location, str) and location.strip() else None), country


def _extract_description(job_detail: dict[str, Any]) -> str | None:
    for key in ("jobDescription", "description", "externalJobDescription"):
        raw = job_detail.get(key)
        if isinstance(raw, str) and raw.strip():
            return strip_html(raw)
    return None


@register("workday")
class WorkdayScraper(BaseAtsScraper):
    """Config-driven scraper for any Workday-hosted careers site.

    Because the target URL varies per employer, use :envvar:`WORKDAY_BASE_URL`
    (or the discrete ``WORKDAY_HOST`` / ``WORKDAY_TENANT`` / ``WORKDAY_SITE`` /
    ``WORKDAY_LOCALE`` variables) to point the scraper at the right endpoint.
    """

    display_name = "Workday (generic)"

    def __init__(
        self,
        session=None,
        *,
        company: dict | None = None,
        config: WorkdayConfig | None = None,
    ) -> None:
        super().__init__(session=session, company=company)
        if config is not None:
            self.config = config
            return

        # Prefer a per-company URL when one is available - the UI passes the
        # companies row through so we can serve multi-tenant Workday sites
        # without touching env vars.
        careers_url = None
        if company:
            careers_url = (
                company.get("careers_url")
                or company.get("extras", {}).get("workday_url")
                or company.get("extras", {}).get("ats_url")
            )

        if careers_url:
            try:
                self.config = WorkdayConfig.from_careers_url(
                    careers_url, session=self.session,
                )
                return
            except WorkdayConfigError:
                # Fall through to env-based config so CLI callers still work.
                if not os.getenv("WORKDAY_BASE_URL") and not os.getenv("WORKDAY_HOST"):
                    raise

        self.config = WorkdayConfig()

    def _search_body(self, filters: SearchFilters, offset: int) -> dict[str, Any]:
        applied_facets: dict[str, list[str]] = {}
        if filters.country:
            applied_facets["locationCountry"] = [filters.country]
        if filters.location:
            applied_facets["locations"] = [filters.location]
        return {
            "appliedFacets": applied_facets,
            "limit": PAGE_LIMIT,
            "offset": offset,
            "searchText": filters.keyword or "",
        }

    def _warm_session(self) -> None:
        """GET the tenant's public search URL so the session gets any cookies
        Workday's edge sets before serving the CXS API. Many tenants respond
        with 303 to a cold POST otherwise, which ``requests`` turns into a
        GET and produces non-JSON HTML."""
        try:
            r = self.session.get(
                self.config.public_search_url,
                headers={
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "en-US,en;q=0.9",
                },
                timeout=DEFAULT_TIMEOUT,
                allow_redirects=True,
            )
            if "community.workday.com/maintenance" in (r.url or ""):
                raise WorkdayConfigError(
                    f"Workday pod hosting {self.config.host} is currently in "
                    f"maintenance ({r.url}). Retry once the pod is back."
                )
        except WorkdayConfigError:
            raise
        except Exception as exc:  # noqa: BLE001 - non-fatal
            log.debug("workday: warmup GET failed for %s: %s",
                      self.config.public_search_url, exc)

    @staticmethod
    def _stub_date_matches(posting: dict[str, Any], filters: SearchFilters) -> bool:
        """Cheap pre-filter that avoids fetching detail for jobs we'd reject.

        Workday puts a human ``postedOn`` on every search result. If a date
        filter is set and the stub's date is unambiguous, honour it here so
        we don't burn N * 200ms fetching details we'd only drop.

        Returns True whenever the date can't be parsed - detail fetch is the
        source of truth in that case.
        """
        if not (filters.date_exact or filters.date_from or filters.date_to):
            return True
        stub_date = parse_human_date(posting.get("postedOn"))
        if stub_date is None:
            return True  # unknown -> let detail-fetch decide
        if filters.date_exact and stub_date != filters.date_exact:
            return False
        if filters.date_from and stub_date < filters.date_from:
            return False
        if filters.date_to and stub_date > filters.date_to:
            return False
        return True

    def discover_stubs(self, filters: SearchFilters) -> tuple[list[JobStub], int]:
        session = self.session
        self._warm_session()
        stubs: list[JobStub] = []
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Referer": self.config.public_search_url,
        }

        offset = 0
        total: int | None = None
        page = 0
        while True:
            page += 1
            if filters.max_pages is not None and page > filters.max_pages:
                break

            body = self._search_body(filters, offset=offset)
            resp = session.post(
                self.config.jobs_url,
                json=body,
                headers=headers,
                timeout=DEFAULT_TIMEOUT,
            )
            resp.raise_for_status()
            # Workday's CXS returns HTML (a maintenance page, a login wall,
            # or an SSO redirect) instead of JSON in some states. Surface a
            # meaningful error rather than letting `.json()` raise a
            # ``JSONDecodeError`` with no context.
            ctype = resp.headers.get("content-type", "")
            if "application/json" not in ctype:
                snippet = (resp.text or "")[:160].strip()
                hint = (
                    " (Workday pod appears to be in maintenance)"
                    if "community.workday.com/maintenance" in (resp.url or resp.text or "")
                    else ""
                )
                raise WorkdayConfigError(
                    f"Workday {self.config.host} returned non-JSON at "
                    f"{self.config.jobs_url}{hint}. First 160 bytes: {snippet!r}"
                )
            payload = resp.json()

            if total is None:
                total = int(payload.get("total") or 0)

            postings = payload.get("jobPostings") or []
            if not postings:
                break

            for posting in postings:
                external_path = posting.get("externalPath") or ""
                title = str(posting.get("title") or "").strip()
                if not external_path or not title:
                    continue

                if not self._stub_date_matches(posting, filters):
                    continue

                job_id = (
                    posting.get("bulletFields", [None])[0]
                    or posting.get("jobRequisitionId")
                    or external_path.rsplit("/", 1)[-1]
                )
                location, _country = _extract_location(posting)

                # `externalPath` looks like `/job/<location>/<slug>_<reqId>`.
                # A raw ``base_url + externalPath`` URL 404s in the browser;
                # Workday's public URLs require the ``/<locale>/<Site>``
                # prefix (which lives on ``public_search_url``).
                stubs.append(
                    JobStub(
                        job_id=str(job_id),
                        title=title,
                        location=location,
                        detail_url=self.config.public_search_url + external_path,
                        source="workday",
                    )
                )

                if filters.limit and len(stubs) >= filters.limit:
                    return stubs, page

            offset += PAGE_LIMIT
            if offset >= (total or 0):
                break

        total_pages = page
        log.info(
            "workday: discovered %d posting(s) across %d page(s) (total=%s)",
            len(stubs), total_pages, total,
        )
        return stubs, total_pages

    def fetch_detail(self, stub: JobStub) -> JobDetail:
        # ``stub.detail_url`` is the public URL, shape:
        #   https://<host>/<locale>/<Site>/job/<location>/<slug>_<reqId>
        # The CXS API for the same posting is:
        #   https://<host>/wday/cxs/<tenant>/<site>/job/<location>/<slug>_<reqId>
        # The path from ``/job/`` onwards is identical, so slice off everything
        # before it and rebuild against the CXS prefix.
        idx = stub.detail_url.find("/job/")
        if idx < 0:
            raise RuntimeError(f"Unexpected Workday detail URL: {stub.detail_url}")
        job_path = stub.detail_url[idx:]
        detail_url = self.config.base_url + JOB_DETAIL_PATH_TEMPLATE.format(
            tenant=self.config.tenant,
            site=self.config.site,
            path=job_path,
        )
        resp = self.session.get(
            detail_url,
            headers={
                "Accept": "application/json",
                "Referer": self.config.public_search_url,
            },
            timeout=DEFAULT_TIMEOUT,
        )
        resp.raise_for_status()
        payload = resp.json() or {}
        job_info = payload.get("jobPostingInfo") or payload

        location, country = _extract_location(job_info)

        # Workday exposes two date-ish fields:
        #   - startDate: ISO datetime, the true "posted at" for most tenants.
        #   - postedOn:  human string like "Posted Today" / "Posted 3 Days Ago".
        # Prefer the ISO field; fall back to the human string so we still get
        # a usable date_posted when startDate is absent.
        date_posted = (
            parse_date(job_info.get("startDate"))
            or parse_date(job_info.get("postedOn"))
            or parse_human_date(job_info.get("postedOn"))
        )

        return JobDetail(
            job_id=str(job_info.get("jobReqId") or stub.job_id),
            title=str(job_info.get("title") or stub.title).strip(),
            detail_url=stub.detail_url,
            source="workday",
            location=location or stub.location,
            country=country,
            date_posted=date_posted,
            employment_type=job_info.get("timeType") or job_info.get("jobFamily"),
            hiring_org=job_info.get("company") or job_info.get("companyName"),
            description=_extract_description(job_info),
            raw=payload,
        )


__all__ = ["WorkdayScraper", "WorkdayConfig", "WorkdayConfigError"]
