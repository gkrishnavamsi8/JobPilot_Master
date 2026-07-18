"""Project section extraction."""

from __future__ import annotations

from jobpilot.services.resume.document import ResumeDocument
from jobpilot.services.resume.patterns import BULLET_RE, INSTITUTION_RE, PROJECT_VERBS


def extract_projects(doc: ResumeDocument) -> list[dict[str, str]]:
    lines = doc.section_text("projects")
    if not lines:
        return []
    return _parse_lines(lines)


def _parse_lines(lines: list[str]) -> list[dict[str, str]]:
    projects: list[dict[str, str]] = []
    title: str | None = None
    desc: list[str] = []

    def flush() -> None:
        nonlocal title, desc
        if title and not _is_noise_title(title):
            projects.append({"title": title, "description": "\n".join(desc).strip()})
        title = None
        desc = []

    for line in lines:
        stripped = BULLET_RE.sub("", line).strip()
        if not stripped:
            continue
        if BULLET_RE.match(line):
            # "• Payment Platform (Java, Kafka)" is a bulleted project title;
            # "• Engineered..." / "- anything" are description bullets.
            if line.lstrip()[0] in "-–—" or _is_description_bullet(stripped):
                desc.append(stripped)
            else:
                flush()
                title = stripped
        elif title and not desc and _title_continues(title):
            title += " " + stripped  # wrapped title line from the PDF
        elif title:
            desc.append(stripped)
        else:
            title = stripped
    flush()
    return projects


def _is_description_bullet(stripped: str) -> bool:
    lower = stripped.lower()
    return any(lower.startswith(v) for v in PROJECT_VERBS)


def _title_continues(title: str) -> bool:
    """An unbalanced paren or trailing comma means the title line wrapped."""
    return title.count("(") > title.count(")") or title.rstrip().endswith((",", "&", "-", "–"))


def _is_noise_title(title: str) -> bool:
    if INSTITUTION_RE.search(title):
        return True
    lower = title.lower()
    return any(lower.startswith(v) for v in PROJECT_VERBS) and len(title) > 60
