"""Deep-merge parsed resume data with user-edited form data."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


def _is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def _merge_values(base: Any, override: Any) -> Any:
    if isinstance(base, BaseModel):
        base = base.model_dump(mode="python")
    if isinstance(override, BaseModel):
        override = override.model_dump(mode="python")

    if isinstance(base, dict) and isinstance(override, dict):
        merged = dict(base)
        for key, value in override.items():
            if key not in merged or _is_empty(merged[key]):
                if not _is_empty(value):
                    merged[key] = value
            elif isinstance(merged[key], dict) and isinstance(value, dict):
                merged[key] = _merge_values(merged[key], value)
            elif isinstance(merged[key], list) and isinstance(value, list):
                merged[key] = _merge_lists(merged[key], value)
            elif not _is_empty(value):
                merged[key] = value
        return merged

    if _is_empty(override):
        return base
    return override


def _merge_lists(base: list[Any], override: list[Any]) -> list[Any]:
    if not base:
        return override
    if not override:
        return base
    # For experience/education lists, prefer override if user edited (non-empty)
    if len(override) >= len(base):
        return override
    return base


def merge_candidate_data(parsed: dict[str, Any], user: dict[str, Any]) -> dict[str, Any]:
    """
    Merge resume parser output with UI form data.

    User-provided non-empty values win over parsed values.
    Parsed values fill gaps the user has not entered yet.
    """
    return _merge_values(parsed, user)
