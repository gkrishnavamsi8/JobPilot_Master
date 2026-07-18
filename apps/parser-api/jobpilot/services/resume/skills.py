"""Skills extraction from dedicated sections and inline lists."""

from __future__ import annotations

import re

from jobpilot.services.resume.document import ResumeDocument
from jobpilot.services.resume.patterns import BULLET_RE, COMMON_SKILLS, SKILL_SPLIT_RE

_MAX_SKILLS = 60

# "Languages/Frameworks: Java, Spring Boot" → strip the category prefix
_CATEGORY_RE = re.compile(r"^([A-Za-z][A-Za-z0-9 /&+#.\-]{1,40})\s*[:\-–]\s+(.+)$")

_NOISE_WORDS = frozenset(
    {"and", "etc", "others", "more", "including", "such", "as", "with"}
)


def extract_skills(doc: ResumeDocument) -> list[str]:
    section_lines = [
        ln
        for ln in doc.section_text("skills")
        if ln.strip().lower() not in {"work", "experience", "employment", "education", "projects"}
    ]
    if section_lines:
        skills = _from_section_lines(section_lines)
        if skills:
            return skills

    full = doc.full_text()
    inline = re.search(
        r"(?i)(?:technical\s+)?skills\s*[:\-]?\s*(.+?)(?=\s*(?:WORK\s+EXPERIENCE|"
        r"PROFESSIONAL\s+EXPERIENCE|EXPERIENCE|EDUCATION|PROJECTS)\b)",
        full,
    )
    if inline:
        skills = _parse_values(inline.group(1))
        if skills:
            return skills[:_MAX_SKILLS]

    for line in doc.non_empty_lines()[:40]:
        if line.count(",") >= 3:
            skills = _parse_values(line)
            if len(skills) >= 4:
                return skills[:_MAX_SKILLS]
    return []


def _from_section_lines(lines: list[str]) -> list[str]:
    result: list[str] = []
    for line in lines:
        line = BULLET_RE.sub("", line).strip()
        if not line:
            continue
        m = _CATEGORY_RE.match(line)
        values = m.group(2) if m else line
        result.extend(_parse_values(values))
    return _dedupe(result)[:_MAX_SKILLS]


def _parse_values(blob: str) -> list[str]:
    # Protect commas inside parens: "Java (17/21), Kafka (Producers, Topics)"
    masked = re.sub(r"\(([^)]*)\)", lambda m: "(" + m.group(1).replace(",", "\x00") + ")", blob)
    out: list[str] = []
    for part in SKILL_SPLIT_RE.split(masked):
        skill = part.replace("\x00", ",").strip(" -•\t:[].")
        skill = _trim_parens(skill)
        if len(skill) > 40 and "(" in skill:
            # "Apache Kafka (Producers, Consumers, Topics...)" → "Apache Kafka"
            skill = re.sub(r"\s*\([^)]*\)?", "", skill).strip()
        if not _is_skill(skill):
            continue
        out.append(skill)
    # Prioritize recognizable skills when the blob was mostly prose
    known = [s for s in out if s.lower() in COMMON_SKILLS]
    if known and len(known) < len(out) // 3:
        rest = [s for s in out if s.lower() not in COMMON_SKILLS and len(s.split()) <= 4]
        return _dedupe(known + rest)
    return _dedupe(out)


def _trim_parens(skill: str) -> str:
    """Strip only unbalanced outer parens, keep "Java (17/21)" intact."""
    skill = skill.strip()
    if skill.startswith("(") and ")" not in skill:
        skill = skill[1:].strip()
    if skill.endswith(")") and "(" not in skill:
        skill = skill[:-1].strip()
    return skill


def _is_skill(skill: str) -> bool:
    if not skill or len(skill) <= 1 or len(skill) > 40:
        return False
    if len(skill.split()) > 5:
        return False
    if skill.lower() in _NOISE_WORDS:
        return False
    if not any(c.isalnum() for c in skill):
        return False
    # Sentence fragments, not skills
    if skill.endswith(".") and len(skill.split()) > 3:
        return False
    return True


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        k = item.lower()
        if k not in seen:
            seen.add(k)
            out.append(item)
    return out
