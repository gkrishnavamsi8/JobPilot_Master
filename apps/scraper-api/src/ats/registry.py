"""Registry of concrete ATS scrapers keyed by short name."""

from __future__ import annotations

from typing import TYPE_CHECKING, Callable, TypeVar

if TYPE_CHECKING:
    from .base import BaseAtsScraper

_REGISTRY: dict[str, type["BaseAtsScraper"]] = {}

T = TypeVar("T", bound="BaseAtsScraper")


def register(name: str) -> Callable[[type[T]], type[T]]:
    """Class decorator that registers an ATS scraper under ``name``.

    ``name`` is the short identifier used by the CLI (``--platform``) and
    stored in the ``source`` column when writing to Postgres.
    """

    def wrap(cls: type[T]) -> type[T]:
        key = name.strip().lower()
        if not key:
            raise ValueError("Scraper name must be a non-empty string")
        if key in _REGISTRY and _REGISTRY[key] is not cls:
            raise ValueError(f"ATS scraper name {key!r} is already registered")
        cls.name = key
        _REGISTRY[key] = cls
        return cls

    return wrap


def get_scraper(name: str) -> type["BaseAtsScraper"]:
    """Return the scraper class registered under ``name``."""
    key = name.strip().lower()
    if key not in _REGISTRY:
        raise KeyError(
            f"No ATS scraper registered as {name!r}. Available: {', '.join(sorted(_REGISTRY))}"
        )
    return _REGISTRY[key]


def list_platforms() -> list[str]:
    """Return sorted names of every registered ATS scraper."""
    return sorted(_REGISTRY)


__all__ = ["register", "get_scraper", "list_platforms"]
