"""Education extraction with institution-anchored grouping."""

from __future__ import annotations

import re

from jobpilot.models.candidate import PartialEducation
from jobpilot.services.resume.dates import parse_date_range, parse_date_token
from jobpilot.services.resume.document import ResumeDocument
from jobpilot.services.resume.patterns import (
    BULLET_RE,
    DATE_RANGE_RE,
    DEGREE_KEYWORDS,
    FIELD_OF_STUDY_RE,
    GPA_RE,
    INSTITUTION_RE,
    LOCATION_RE,
    PROJECT_VERBS,
    SINGLE_MONTH_DATE_RE,
    YEAR_ONLY_RE,
)

_DEGREE_TOKEN_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in sorted(DEGREE_KEYWORDS, key=len, reverse=True)) + r")",
    re.I,
)


def extract_education(doc: ResumeDocument) -> list[PartialEducation]:
    lines = doc.section_text("education")
    if not lines:
        lines = _scan_education_lines(doc.non_empty_lines())
    lines = _truncate_at_projects(lines)
    entries: list[PartialEducation] = []
    for block in _group_blocks(lines):
        entry = _parse_block(block)
        if _valid(entry):
            entries.append(entry)
    return entries[:4]


def _scan_education_lines(lines: list[str]) -> list[str]:
    result: list[str] = []
    prev_matched = False
    for line in lines:
        lower = line.lower()
        if lower.startswith("education "):
            line = line[len("education ") :].strip()
        stripped = line.strip()
        if INSTITUTION_RE.search(line) or _match_degree(line) or FIELD_OF_STUDY_RE.search(line):
            result.append(line)
            prev_matched = True
        elif prev_matched and (
            YEAR_ONLY_RE.fullmatch(stripped)
            or SINGLE_MONTH_DATE_RE.match(stripped)
            or DATE_RANGE_RE.fullmatch(stripped)
        ):
            # Graduation year on its own line right after the degree
            result.append(stripped)
            prev_matched = False
        else:
            prev_matched = False
    return result


def _truncate_at_projects(lines: list[str]) -> list[str]:
    out: list[str] = []
    for line in lines:
        if re.match(r"^projects?\b", line.strip(), re.I):
            break
        if _looks_like_project(line):
            break
        out.append(line)
    return out


def _looks_like_project(line: str) -> bool:
    # Bulleted education entries ("• VIT | 2019 – 2023") are not projects
    if INSTITUTION_RE.search(line) or _match_degree(line):
        return False
    if BULLET_RE.match(line):
        stripped = BULLET_RE.sub("", line).strip()
        if DATE_RANGE_RE.search(stripped) or GPA_RE.search(stripped):
            return False
        return True
    lower = line.lower()
    return any(v in lower for v in PROJECT_VERBS)


def _group_blocks(lines: list[str]) -> list[list[str]]:
    """New block starts at each institution line (or degree line when the
    current block already has both a school and a degree)."""
    blocks: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        stripped = BULLET_RE.sub("", line).strip()
        if not stripped:
            continue
        is_school = bool(INSTITUTION_RE.search(stripped))
        if current and is_school and any(INSTITUTION_RE.search(p) for p in current):
            blocks.append(current)
            current = [stripped]
        elif (
            current
            and not is_school
            and _match_degree(stripped)
            and any(_match_degree(p) and not INSTITUTION_RE.search(p) for p in current)
            and any(INSTITUTION_RE.search(p) for p in current)
        ):
            blocks.append(current)
            current = [stripped]
        else:
            current.append(stripped)
    if current:
        blocks.append(current)
    return blocks


def _parse_block(lines: list[str]) -> PartialEducation:
    school = degree = field = gpa = None
    start = end = None
    is_current = False

    # Split gap-separated parts so "School | City, Country" and
    # "Degree in Field | Jul 2019 – Jun 2023" are handled per-part.
    parts: list[str] = []
    for line in lines:
        for piece in line.split("|"):
            piece = piece.strip(" ,–—-")
            if piece:
                parts.append(piece)

    for part in parts:
        g = GPA_RE.search(part)
        if g:
            gpa = gpa or g.group(1).replace(" ", "")
            part = GPA_RE.sub("", part).strip(" ,;–—-")
            if not part:
                continue

        dr = DATE_RANGE_RE.search(part)
        if dr:
            s, e, cur = parse_date_range(part)
            start, end, is_current = start or s, end or e, is_current or cur
            part = DATE_RANGE_RE.sub("", part).strip(" ,–—-")
            if not part:
                continue
        elif YEAR_ONLY_RE.fullmatch(part) or SINGLE_MONTH_DATE_RE.match(part):
            end = end or parse_date_token(part)
            continue

        part_degree = _match_degree(part)
        if part_degree and not INSTITUTION_RE.search(part):
            if not degree:
                degree = part_degree
                field = field or _extract_field(part)
            continue

        if INSTITUTION_RE.search(part):
            if not school:
                school = _clean_school(part)
            if part_degree and not degree:
                degree = part_degree
                field = field or _extract_field(part)
            continue

        fm = FIELD_OF_STUDY_RE.search(part)
        if fm and not field:
            field = fm.group(0).strip().title()
            continue

        if LOCATION_RE.match(part):
            continue
        if degree and not field and len(part.split()) <= 8 and not _looks_like_project(part):
            field = part
        elif not school and len(part) < 100 and not _looks_like_project(part):
            school = part

    return PartialEducation(
        school=school,
        degree=degree,
        field_of_study=field,
        start_date=start,
        end_date=end,
        gpa=gpa,
        is_current=is_current,
    )


def _match_degree(text: str) -> str | None:
    m = _DEGREE_TOKEN_RE.search(text.lower())
    return DEGREE_KEYWORDS[m.group(1).lower()] if m else None


def _extract_field(part: str) -> str | None:
    fm = FIELD_OF_STUDY_RE.search(part)
    if fm:
        return fm.group(0).strip().title()
    m = re.split(r"\s+in\s+", part, maxsplit=1, flags=re.I)
    if len(m) == 2:
        field = m[1].strip(" ,.")
        field = DATE_RANGE_RE.sub("", field).strip(" ,–—-")
        return field or None
    # Short field code right after the degree token: "B.Tech ECE"
    dm = _DEGREE_TOKEN_RE.search(part.lower())
    if dm:
        tail = part[dm.end() :].strip(" ,.")
        tail = re.sub(r"^of\s+", "", tail, flags=re.I).strip()
        token = tail.split()[0] if tail.split() else ""
        if token and not YEAR_ONLY_RE.fullmatch(token) and not SINGLE_MONTH_DATE_RE.match(tail):
            if token.isupper() and 2 <= len(token) <= 5:
                return token
    return None


def _clean_school(part: str) -> str:
    """Strip degree tokens that share the school line: "VIT — B.Tech ..."""
    dm = _DEGREE_TOKEN_RE.search(part.lower())
    if dm and dm.start() > 3:
        return part[: dm.start()].strip(" ,.-–—")
    return part.strip(" ,.")


def _valid(entry: PartialEducation) -> bool:
    if not entry.school and not entry.degree:
        return False
    if entry.school and _looks_like_project(entry.school):
        return False
    return True
