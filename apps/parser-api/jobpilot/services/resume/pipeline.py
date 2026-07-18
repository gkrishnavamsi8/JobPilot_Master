"""Resume parsing pipeline — layout extract → segment → field extractors."""

from __future__ import annotations

from datetime import date

from jobpilot.models.application import ApplicationPreferences
from jobpilot.models.candidate import (
    CandidateData,
    PartialWorkExperience,
    ParsedResumeResult,
)
from jobpilot.services.resume.contact import extract_profile
from jobpilot.services.resume.document import ResumeDocument, ResumeLine
from jobpilot.services.resume.education import extract_education
from jobpilot.services.resume.experience import extract_experience
from jobpilot.services.resume.layout import ExtractedContent, extract_from_bytes
from jobpilot.services.resume.normalize import normalize_document_lines
from jobpilot.services.resume.projects import extract_projects
from jobpilot.services.resume.segment import segment_document
from jobpilot.services.resume.skills import extract_skills


def parse_resume_bytes(content: bytes, filename: str) -> ParsedResumeResult:
    extracted = extract_from_bytes(content, filename)
    doc = _document_from_extracted(extracted)
    return _run_pipeline(doc)


def parse_resume_text(text: str) -> ParsedResumeResult:
    normalized = normalize_document_lines([text])
    doc = ResumeDocument(
        raw_text="\n".join(normalized),
        lines=[ResumeLine(text=ln, index=i) for i, ln in enumerate(normalized)],
    )
    return _run_pipeline(doc)


def _document_from_extracted(extracted: ExtractedContent) -> ResumeDocument:
    """Build a ResumeDocument keeping per-line font/header hints aligned
    even when normalization splits a source line into several pieces."""
    lines: list[ResumeLine] = []
    for src in extracted.lines:
        pieces = normalize_document_lines([src.stripped])
        for piece in pieces:
            lines.append(
                ResumeLine(
                    text=piece,
                    index=len(lines),
                    font_size=src.font_size,
                    is_header=src.is_header if len(pieces) == 1 else _piece_is_header(piece),
                )
            )
    return ResumeDocument(
        raw_text="\n".join(ln.text for ln in lines),
        lines=lines,
        hyperlinks=list(extracted.hyperlinks),
    )


def _piece_is_header(piece: str) -> bool:
    return piece.isupper() and 3 <= len(piece) <= 40 and len(piece.split()) <= 6


def _run_pipeline(doc: ResumeDocument) -> ParsedResumeResult:
    doc = segment_document(doc)
    filled: list[str] = []

    profile, profile_filled = extract_profile(doc)
    filled.extend(profile_filled)

    skills = extract_skills(doc)
    if skills:
        profile.skills = skills
        filled.append("profile.skills")

    work = extract_experience(doc)
    if work:
        filled.append("work_experience")

    education = extract_education(doc)
    if education:
        filled.append("education")

    metadata: dict = {}
    projects = extract_projects(doc)
    if projects:
        metadata["projects"] = projects
        filled.append("metadata.projects")

    certifications = doc.section_text("certifications")
    if certifications:
        metadata["certifications"] = certifications[:10]
        filled.append("metadata.certifications")

    awards = doc.section_text("awards")
    if awards:
        metadata["awards"] = awards[:10]
        filled.append("metadata.awards")

    preferences = ApplicationPreferences()
    years = _years_of_experience(work)
    if years is not None:
        preferences.years_of_experience = years
        filled.append("preferences.years_of_experience")

    data = CandidateData(
        profile=profile,
        work_experience=work,
        education=education,
        preferences=preferences,
        metadata=metadata,
    )

    return ParsedResumeResult(
        extracted=data,
        filled_fields=sorted(set(filled)),
        raw_text_preview=doc.full_text()[:800] or None,
    )


def _years_of_experience(entries: list[PartialWorkExperience]) -> float | None:
    earliest: date | None = None
    for entry in entries:
        if isinstance(entry.start_date, date):
            if earliest is None or entry.start_date < earliest:
                earliest = entry.start_date
    if not earliest:
        return None
    return round((date.today() - earliest).days / 365.25, 1)
