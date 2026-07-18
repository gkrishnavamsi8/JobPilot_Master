"""Parse resume text into structured candidate fields (facade over resume pipeline)."""

from jobpilot.services.resume.pipeline import parse_resume_bytes, parse_resume_text

__all__ = ["parse_resume_bytes", "parse_resume_text"]
