"""Multi-strategy resume section segmentation."""

from __future__ import annotations

import re

from jobpilot.services.resume.document import ResumeDocument, ResumeLine
from jobpilot.services.resume.patterns import SECTION_ALIASES, SECTION_HEADER_RES


def segment_document(doc: ResumeDocument) -> ResumeDocument:
    """Assign lines to sections using header detection + full-text fallback."""
    # Strategy 1: line-by-line header detection (supports inline remainder)
    sections: dict[str, list[ResumeLine]] = {}
    current: str | None = None

    for line in doc.lines:
        section, remainder = _parse_header(line)
        if section:
            current = section
            sections.setdefault(current, [])
            line.section = current
            if remainder:
                rem_line = ResumeLine(
                    text=remainder,
                    index=line.index,
                    font_size=line.font_size,
                    is_header=False,
                    section=current,
                )
                sections[current].append(rem_line)
            continue
        if line.is_header and not line.section:
            guessed = _guess_section_from_header_text(line.stripped)
            if guessed:
                current = guessed
                sections.setdefault(current, [])
                line.section = current
                continue
        if current:
            line.section = current
            sections[current].append(line)

    # Strategy 2: full-text boundary extraction for missing sections
    full = doc.full_text()
    for name in SECTION_ALIASES:
        if sections.get(name):
            continue
        extracted = _extract_section_from_text(full, name)
        if extracted:
            sections[name] = [
                ResumeLine(text=ln, index=i, section=name) for i, ln in enumerate(extracted)
            ]

    doc.sections = sections
    return doc


def _parse_header(line: ResumeLine) -> tuple[str | None, str | None]:
    raw = line.stripped
    if not raw:
        return None, None
    best: tuple[int, str, str | None] | None = None
    for name, pattern in SECTION_HEADER_RES:
        match = pattern.match(raw)
        if not match:
            continue
        alias = match.group(1)
        separator = match.group(2)
        remainder = (match.group(3) or "").strip()
        if remainder and re.match(r"^(?:&|and)\s+\w+\s*$", remainder, re.I):
            remainder = ""  # "Projects & Publication" — compound header title
        if remainder and not _header_with_body_ok(line, alias, separator, remainder):
            continue
        if best is None or len(alias) > best[0]:
            best = (len(alias), name, remainder or None)
    if best:
        return best[1], best[2]
    return None, None


def _header_with_body_ok(
    line: ResumeLine, alias: str, separator: str | None, remainder: str
) -> bool:
    """Accept "SKILLS: Python, ..." / "PROJECTS Foo" but reject prose like
    "Experience in Java development for 5 years"."""
    if separator == ":":
        return True
    if line.is_header or alias.isupper():
        return True
    # Title-case alias glued to a body that starts a new phrase
    if alias[:1].isupper() and remainder[:1] and (remainder[0].isupper() or remainder[0].isdigit()):
        return True
    return False


def _guess_section_from_header_text(text: str) -> str | None:
    clean = re.sub(r"[^A-Za-z\s&]", "", text).strip().lower()
    for section, aliases in SECTION_ALIASES.items():
        if clean in aliases:
            return section
    return None


def _extract_section_from_text(text: str, section: str) -> list[str]:
    boundaries = "|".join(
        re.escape(a)
        for sec, aliases in SECTION_ALIASES.items()
        if sec != section
        for a in aliases
    )
    aliases = "|".join(re.escape(a) for a in SECTION_ALIASES[section])
    pattern = rf"(?is)(?:^|\n)\s*({aliases})\.?\s*\n(.*?)(?=\n\s*(?:{boundaries})\b|\Z)"
    match = re.search(pattern, text)
    if match:
        chunk = match.group(2).strip()
        return [ln.strip() for ln in chunk.splitlines() if ln.strip()]

    # Inline header: "EXPERIENCE Senior Developer..."
    inline = rf"(?is)\b({aliases})\.?\s+(.+?)(?=\b(?:{boundaries})\b|\Z)"
    match = re.search(inline, text)
    if match:
        body = match.group(2).strip()
        return [ln.strip() for ln in body.splitlines() if ln.strip()]
    return []
