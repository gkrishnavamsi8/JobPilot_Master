"""Shared HTTP session with retries and polite defaults."""

from __future__ import annotations

import logging
import os
import random
import time
from typing import Any

import requests
from requests import Response, Session
from tenacity import (
    RetryError,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

log = logging.getLogger(__name__)

DEFAULT_USER_AGENT = (
    "jobpilot-scraper/0.1 (+https://github.com/your-org/jobpilot; contact=admin@example.com)"
)
DEFAULT_TIMEOUT = 30.0
_RETRYABLE_STATUSES = {429, 500, 502, 503, 504}


class HttpStatusError(RuntimeError):
    """Raised for HTTP responses that we consider retryable or fatal."""

    def __init__(self, status_code: int, url: str) -> None:
        super().__init__(f"HTTP {status_code} for {url}")
        self.status_code = status_code
        self.url = url


def build_session(user_agent: str | None = None) -> Session:
    """Return a configured :class:`requests.Session`.

    The session sets a descriptive User-Agent and Accept-Language, both of
    which the site's edge cache tends to honor. Retries are handled by
    ``tenacity`` (see :func:`get`) rather than urllib3's retry adapter so that
    we can react to specific response statuses.
    """
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": user_agent or os.getenv("SCRAPER_USER_AGENT") or DEFAULT_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    return session


@retry(
    reraise=True,
    stop=stop_after_attempt(4),
    wait=wait_exponential_jitter(initial=1.0, max=15.0),
    retry=retry_if_exception_type((requests.RequestException, HttpStatusError)),
)
def get(
    session: Session,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    jitter_range: tuple[float, float] = (0.05, 0.25),
) -> Response:
    """GET ``url`` with retries and a small pre-request jitter.

    Raises :class:`HttpStatusError` for retryable HTTP status codes so that
    tenacity can retry them; other 4xx responses raise immediately via
    ``raise_for_status``.
    """
    if jitter_range:
        low, high = jitter_range
        if high > 0:
            time.sleep(random.uniform(low, high))

    response = session.get(url, params=params, timeout=timeout)
    if response.status_code in _RETRYABLE_STATUSES:
        log.warning("Retryable HTTP %s for %s", response.status_code, response.url)
        raise HttpStatusError(response.status_code, response.url)
    response.raise_for_status()
    return response


__all__ = ["build_session", "get", "HttpStatusError", "RetryError", "DEFAULT_USER_AGENT"]
