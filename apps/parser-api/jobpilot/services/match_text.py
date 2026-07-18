"""Build concatenated profile text for JD skill matching."""

from __future__ import annotations

from jobpilot.models.candidate import CandidateData


def build_match_text(data: CandidateData) -> str:
    parts: list[str] = []

    profile = data.profile
    if profile and profile.summary and profile.summary.strip():
        parts.append(profile.summary.strip())

    if profile and profile.skills:
        parts.append(", ".join(profile.skills))

    for role in data.work_experience or []:
        chunk = f"{role.title or ''} {role.description or ''}".strip()
        if chunk:
            parts.append(chunk)

    for edu in data.education or []:
        chunk = f"{edu.degree or ''} {edu.field_of_study or ''}".strip()
        if chunk:
            parts.append(chunk)

    if data.cover_letter and data.cover_letter.strip():
        parts.append(data.cover_letter.strip())

    return "\n".join(parts)
