"""ATS scraper plugins.

Importing this package registers every concrete scraper in
:mod:`src.ats.registry`. Adding a new platform is a two-step process:

1. Create ``src/ats/<name>.py`` with a subclass of ``BaseAtsScraper`` decorated
   with ``@register("<name>")``.
2. Add an import for it below so the decorator side-effects run at startup.
"""

from .base import BaseAtsScraper  # noqa: F401
from .registry import get_scraper, list_platforms, register  # noqa: F401

# Concrete implementations - import for side-effect registration.
from . import astrazeneca  # noqa: F401
from . import workday  # noqa: F401

__all__ = ["BaseAtsScraper", "get_scraper", "list_platforms", "register"]
