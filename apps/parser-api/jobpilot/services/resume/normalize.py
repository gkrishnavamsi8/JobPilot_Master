"""Text normalization before segmentation."""

from __future__ import annotations

import re

from jobpilot.services.resume.patterns import SECTION_BREAK_RE


def normalize_text(text: str) -> str:
    text = text.lstrip("\ufeff")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = SECTION_BREAK_RE.sub("\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(
        r"(\d{4}\s*[-–—]\s*\d{4})\s+(Projects?\b)",
        r"\1\n\2",
        text,
        flags=re.I,
    )
    return text.strip()


def normalize_document_lines(lines: list[str]) -> list[str]:
    joined = normalize_text("\n".join(lines))
    return [ln.strip() for ln in joined.splitlines() if ln.strip()]
