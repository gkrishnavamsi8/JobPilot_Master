"""Work experience extraction.

Strategy: anchor each job on its date line (every job entry has exactly one
date range in its header), claim up to two header-ish lines above the anchor
as title/company, and everything until the next job's header as description.
Falls back to title-line grouping when a section has no dates at all.
"""

from __future__ import annotations

import re

from jobpilot.models.candidate import PartialWorkExperience
from jobpilot.services.resume.dates import parse_date_range, strip_dates
from jobpilot.services.resume.document import ResumeDocument
from jobpilot.services.resume.patterns import (
    BULLET_RE,
    COMPANY_HINTS_RE,
    DATE_RANGE_RE,
    EMPLOYMENT_TYPE_RE,
    INSTITUTION_RE,
    JOB_TITLE_RE,
    PROJECT_VERBS,
    ROLE_PHRASES,
    SECTION_ALIASES,
    SENIORITY_RE,
    SINGLE_MONTH_DATE_RE,
    is_probable_location,
)

_OTHER_SECTION_STARTS = tuple(
    alias
    for section, aliases in SECTION_ALIASES.items()
    if section != "experience"
    for alias in aliases
)


def extract_experience(doc: ResumeDocument) -> list[PartialWorkExperience]:
    lines = doc.section_text("experience")
    if not lines:
        lines = _scan_for_experience(doc.non_empty_lines())
    lines = [_unbullet_header(ln.strip()) for ln in lines if ln.strip()]
    entries: list[PartialWorkExperience] = []
    for block in _split_blocks(lines):
        entry = _parse_block(block)
        if _valid(entry):
            entries.append(entry)
    return _merge_umbrella_companies(entries)


def _unbullet_header(line: str) -> str:
    """Some resumes bullet their job entries ("• Software Developer | Jul 2023
    – Present"). Strip the marker when the line is an entry header, so it
    isn't mistaken for a description bullet."""
    if not BULLET_RE.match(line):
        return line
    stripped = BULLET_RE.sub("", line).strip()
    has_date = bool(DATE_RANGE_RE.search(stripped)) or bool(
        SINGLE_MONTH_DATE_RE.match(stripped)
    )
    if has_date and ("|" in stripped or _looks_like_title(stripped)):
        return stripped
    return line


def _merge_umbrella_companies(
    entries: list[PartialWorkExperience],
) -> list[PartialWorkExperience]:
    """Handle "Company | Location | full-range" followed by role sub-entries:

        Amdocs | Pune, India        Sep 2023 - Present
        Senior Developer            Jul 2025 - Present
        • ...
        Developer                   Sep 2023 - Jun 2025
        • ...

    The company-only entry is an umbrella — propagate its company/location
    into the title-only roles that follow and drop the umbrella itself."""
    result: list[PartialWorkExperience] = []
    i = 0
    while i < len(entries):
        entry = entries[i]
        is_umbrella = bool(entry.company) and not entry.title and not entry.description
        if is_umbrella:
            absorbed = 0
            for follower in entries[i + 1 :]:
                if follower.company:
                    break
                follower.company = entry.company
                follower.location = follower.location or entry.location
                absorbed += 1
            if absorbed:
                i += 1
                continue
        result.append(entry)
        i += 1
    return result


# ------------------------------------------------------------- scanning


def _scan_for_experience(lines: list[str]) -> list[str]:
    """Collect lines that look like employment when no section header exists."""
    result: list[str] = []
    capturing = False
    for line in lines:
        if _is_section_boundary(line):
            if capturing:
                break
            continue
        if _is_job_header(line):
            capturing = True
            result.append(line)
            continue
        if capturing:
            if _is_education_boundary(line):
                break
            result.append(line)
    return result


def _is_section_boundary(line: str) -> bool:
    clean = line.strip().rstrip(":").strip().lower()
    return clean in _OTHER_SECTION_STARTS


def _is_education_boundary(line: str) -> bool:
    return bool(INSTITUTION_RE.search(line) and not _looks_like_title(line))


def _is_job_header(line: str) -> bool:
    if BULLET_RE.match(line) or _is_description(line):
        return False
    if "|" in line or " at " in line.lower():
        return _looks_like_title(line) or _looks_like_company(line)
    return _looks_like_title(line)


# ------------------------------------------------------------- blocking


def _has_anchor_date(line: str) -> bool:
    if BULLET_RE.match(line):
        return False
    stripped = line.strip()
    if SINGLE_MONTH_DATE_RE.match(stripped):
        return True
    if not DATE_RANGE_RE.search(stripped):
        return False
    # Header date lines are short; prose sentences mentioning a range aren't.
    return len(stripped) <= 100 and not _is_description(stripped)


def _split_blocks(lines: list[str]) -> list[list[str]]:
    if not lines:
        return []

    anchors = [i for i, ln in enumerate(lines) if _has_anchor_date(ln)]
    if not anchors:
        return _fallback_blocks(lines)

    starts: list[int] = []
    prev_anchor = -1
    for anchor in anchors:
        start = anchor
        walked = 0
        while start - 1 > prev_anchor and walked < 2 and _is_headerish(lines[start - 1]):
            start -= 1
            walked += 1
        starts.append(start)
        prev_anchor = anchor

    starts[0] = 0  # leading lines belong to the first job
    blocks: list[list[str]] = []
    for i, start in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(lines)
        block = lines[start:end]
        if block:
            blocks.append(block)
    return blocks


def _is_headerish(line: str) -> bool:
    if BULLET_RE.match(line) or _is_description(line) or _has_anchor_date(line):
        return False
    if len(line) > 90:
        return False
    return _looks_like_title(line) or _looks_like_company(line) or "|" in line


def _fallback_blocks(lines: list[str]) -> list[list[str]]:
    blocks: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if current and _is_job_header(line) and any(_is_description(b) for b in current):
            blocks.append(current)
            current = [line]
        else:
            current.append(line)
    if current:
        blocks.append(current)
    return blocks


# -------------------------------------------------------------- parsing


def _parse_block(lines: list[str]) -> PartialWorkExperience:
    header_lines: list[str] = []
    desc_lines: list[str] = []
    for line in lines:
        if (
            not desc_lines
            and len(header_lines) < 4
            and (_has_anchor_date(line) or _is_headerish(line))
        ):
            header_lines.append(line)
        else:
            desc_lines.append(line)

    start = end = None
    is_current = False
    for line in header_lines:
        s, e, cur = parse_date_range(line)
        if s or e or cur:
            start, end, is_current = s, e, cur
            break

    parts: list[str] = []
    for line in header_lines:
        cleaned = strip_dates(line)
        for piece in re.split(r"\s*\|\s*|\s+at\s+|\s+@\s+", cleaned, flags=re.I):
            piece = piece.strip(" ,–—-•")
            if piece:
                parts.append(piece)

    title, company, location, employment_type = _classify_parts(parts)

    description = "\n".join(desc_lines).strip() or None
    if not is_current and start and not end:
        is_current = True

    return PartialWorkExperience(
        title=title,
        company=company,
        location=location,
        start_date=start,
        end_date=end,
        is_current=is_current,
        description=description,
        employment_type=employment_type,
    )


def _classify_parts(
    parts: list[str],
) -> tuple[str | None, str | None, str | None, str | None]:
    title = company = location = employment_type = None
    leftovers: list[str] = []

    for part in parts:
        et = EMPLOYMENT_TYPE_RE.search(part)
        if et:
            employment_type = employment_type or et.group(1).lower()
            remainder = (part[: et.start()] + part[et.end() :]).strip(" ,()–—-")
            if not remainder:
                # A bare "Intern" is also the job title
                if title is None and et.group(1).lower() in {"intern", "internship"}:
                    title = part
                continue
            part = remainder
        if location is None and is_probable_location(part) and not _looks_like_title(part):
            location = part
            continue
        if title is None and _looks_like_title(part):
            # "Software Engineer Acme Corp" glued in one part
            if company is None and not COMPANY_HINTS_RE.search(part):
                split_t, split_c = _split_title_company(part)
                if split_c:
                    title, company = split_t, split_c
                    continue
            title = part
            continue
        if company is None and _looks_like_company(part):
            company = part
            continue
        leftovers.append(part)

    for part in leftovers:
        if title is None:
            title = part
        elif company is None:
            company = part
        elif location is None and is_probable_location(part):
            location = part

    if company:
        company, extracted_loc = _strip_trailing_location(company)
        if extracted_loc:
            location = location or extracted_loc
        elif location is None:
            company, location = _split_company_comma_city(company)

    return title, company, location, employment_type


_CORP_SUFFIXES = frozenset(
    {"inc", "llc", "llp", "ltd", "limited", "pvt", "co", "corp", "gmbh", "plc", "sa"}
)


def _split_company_comma_city(company: str) -> tuple[str, str | None]:
    """"Amdocs, Pune" → ("Amdocs", "Pune"); keep "Deloitte, LLP" whole."""
    parts = [p.strip() for p in company.split(",")]
    if len(parts) != 2 or not all(parts):
        return company, None
    tail = parts[1]
    if tail.rstrip(".").lower() in _CORP_SUFFIXES:
        return company, None
    if len(tail.split()) <= 2 and tail[0].isupper() and not COMPANY_HINTS_RE.search(tail):
        return parts[0], tail
    return company, None


def _split_title_company(text: str) -> tuple[str | None, str | None]:
    """Split "Senior Developer Acme Corp" when title and company share a part."""
    words = text.split()
    if len(words) < 3:
        return text, None
    for i in range(len(words) - 1, 1, -1):
        left = " ".join(words[:i])
        right = " ".join(words[i:])
        if _looks_like_title(left) and not _looks_like_title(right) and _looks_like_company(right):
            return left, right
    return text, None


def _strip_trailing_location(company: str) -> tuple[str, str | None]:
    """Pull "Pune, India" off "Bajaj Finserv Pune, India"."""
    m = re.search(r"\s+([A-Z][A-Za-z .'\-]{1,25},\s*[A-Z][A-Za-z .'\-]{1,25})$", company)
    if (
        m
        and len(company[: m.start()].strip()) >= 3
        and is_probable_location(m.group(1))
    ):
        return company[: m.start()].strip(" ,"), m.group(1)
    return company, None


def _looks_like_title(text: str) -> bool:
    if not text or DATE_RANGE_RE.search(text):
        return False
    if len(text) > 80:
        return False
    if JOB_TITLE_RE.search(text) or SENIORITY_RE.search(text):
        return True
    lower = text.lower()
    return any(p in lower for p in ROLE_PHRASES)


def _looks_like_company(text: str) -> bool:
    if not text or DATE_RANGE_RE.search(text) or BULLET_RE.match(text) or _is_description(text):
        return False
    if _looks_like_title(text) and not COMPANY_HINTS_RE.search(text):
        return False
    if COMPANY_HINTS_RE.search(text):
        return True
    words = text.split()
    return 1 <= len(words) <= 6 and text[0].isupper()


def _is_description(text: str) -> bool:
    if BULLET_RE.match(text):
        return True
    lower = text.lower()
    return any(lower.startswith(v) for v in PROJECT_VERBS) or (
        text.endswith(".") and len(text.split()) >= 4 and not _looks_like_title(text)
    )


def _valid(entry: PartialWorkExperience) -> bool:
    if not entry.title and not entry.company:
        return False
    # A lone title/company with no dates and no description is noise
    if not entry.start_date and not entry.end_date and not entry.description:
        return False
    for field in (entry.title, entry.company):
        if field and _is_description(field):
            return False
    return True
