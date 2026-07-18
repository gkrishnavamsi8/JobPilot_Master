"""Extract text from PDF and DOCX resume files."""

from __future__ import annotations

from jobpilot.services.resume.layout import extract_from_bytes, extract_text_from_bytes

__all__ = ["extract_from_bytes", "extract_text_from_bytes"]
