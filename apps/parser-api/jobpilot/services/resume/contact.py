"""Contact and profile field extraction."""

from __future__ import annotations

import re

from jobpilot.models.candidate import PartialAddress, PartialPhone, PartialProfile
from jobpilot.services.resume.document import ResumeDocument
from jobpilot.services.resume.patterns import (
    COMMON_SKILLS,
    COMPANY_HINTS_RE,
    EMAIL_RE,
    GITHUB_RE,
    INSTITUTION_RE,
    JOB_TITLE_RE,
    LINKEDIN_RE,
    PHONE_RE,
    REMOTE_RE,
    ROLE_PHRASES,
    SECTION_ALIASES,
    SENIORITY_RE,
    URL_RE,
    ZIP_RE,
    is_probable_location,
)

SECTION_WORDS = frozenset(
    word
    for aliases in SECTION_ALIASES.values()
    for alias in aliases
    for word in alias.lower().split()
)

NOT_NAME_WORDS = frozenset(
    {
        "software",
        "engineer",
        "developer",
        "senior",
        "junior",
        "lead",
        "manager",
        "analyst",
        "intern",
        "technical",
        "skills",
        "skill",
        "experience",
        "education",
        "project",
        "projects",
        "summary",
        "objective",
        "profile",
        "resume",
        "curriculum",
        "vitae",
        "present",
        "current",
        "python",
        "java",
        "javascript",
        "typescript",
    }
)

DATE_LIKE = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4})\b",
    re.I,
)

_NOISE_URI_RE = re.compile(r"drive\.google|docs\.google|mailto:|tel:", re.I)


def extract_profile(doc: ResumeDocument) -> tuple[PartialProfile, list[str]]:
    text = doc.full_text()
    lines = doc.non_empty_lines()
    filled: list[str] = []
    profile = PartialProfile()

    email = _first(EMAIL_RE, text) or _email_from_links(doc.hyperlinks)
    if email:
        profile.email = email
        filled.append("profile.email")

    phone = _find_phone(text, doc.hyperlinks)
    if phone:
        profile.phone = PartialPhone(number=phone)
        filled.append("profile.phone.number")

    linkedin = _first(LINKEDIN_RE, text) or _link_matching(doc.hyperlinks, "linkedin.com/")
    if linkedin:
        if not linkedin.startswith("http"):
            linkedin = "https://" + linkedin.lstrip("/")
        profile.social.linkedin = linkedin
        filled.append("profile.social.linkedin")

    github = _first(GITHUB_RE, text) or _link_matching(doc.hyperlinks, "github.com/")
    if github:
        if not github.startswith("http"):
            github = "https://" + github.lstrip("/")
        profile.social.github = github
        filled.append("profile.social.github")

    website = _find_website(text, doc.hyperlinks, exclude={linkedin or "", github or ""})
    if website:
        profile.social.website = website
        filled.append("profile.social.website")

    first, last = _extract_name(doc, email)
    if first:
        profile.first_name = first
        filled.append("profile.first_name")
    if last:
        profile.last_name = last
        filled.append("profile.last_name")

    address = _guess_address(lines)
    if address:
        profile.address = address
        for field in ("line1", "city", "state", "postal_code", "country"):
            if getattr(address, field):
                filled.append(f"profile.address.{field}")

    summary_lines = doc.section_text("summary")
    if summary_lines:
        profile.summary = " ".join(summary_lines[:8])[:2000]
        filled.append("profile.summary")

    return profile, filled


def _first(pattern: re.Pattern[str], text: str) -> str | None:
    m = pattern.search(text)
    return m.group(0).strip() if m else None


def _email_from_links(hyperlinks: list[str]) -> str | None:
    for uri in hyperlinks:
        if uri.lower().startswith("mailto:"):
            candidate = uri[7:].split("?")[0].strip()
            if EMAIL_RE.fullmatch(candidate):
                return candidate
    return None


def _link_matching(hyperlinks: list[str], fragment: str) -> str | None:
    for uri in hyperlinks:
        if fragment in uri.lower():
            return uri.rstrip("/")
    return None


def _find_phone(text: str, hyperlinks: list[str]) -> str | None:
    candidates: list[str] = []
    for uri in hyperlinks:
        if uri.lower().startswith("tel:"):
            candidates.append(uri[4:])
    candidates.extend(m.group(0) for m in PHONE_RE.finditer(text))
    for cand in candidates:
        digits = re.sub(r"\D", "", cand)
        if 10 <= len(digits) <= 13:
            return cand.strip()
    return None


def _find_website(text: str, hyperlinks: list[str], exclude: set[str]) -> str | None:
    seen = [u.rstrip(".,;") for u in URL_RE.findall(text)]
    seen.extend(hyperlinks)
    for url in seen:
        if any(ex and ex in url for ex in exclude):
            continue
        lower = url.lower()
        if "linkedin.com" in lower or "github.com" in lower or _NOISE_URI_RE.search(lower):
            continue
        return url.rstrip(".,;/")
    return None


def _extract_name(doc: ResumeDocument, email: str | None) -> tuple[str | None, str | None]:
    lines = doc.non_empty_lines()
    candidates: list[tuple[float, str, str]] = []

    # 0) Largest-font line near the top of a PDF is almost always the name
    sized = [ln for ln in doc.lines[:10] if ln.font_size]
    if sized:
        body_sizes = sorted(ln.font_size for ln in doc.lines if ln.font_size)
        median = body_sizes[len(body_sizes) // 2] if body_sizes else 10.0
        biggest = max(sized, key=lambda ln: ln.font_size)
        if biggest.font_size >= median * 1.2:
            name = _parse_name_words(biggest.stripped)
            if name and _looks_like_person_name(biggest.stripped, name):
                candidates.append((-10.0, name[0], name[1]))

    # 1) Name glued on same line as email/phone: "Gaurav Pampana gaurav@gmail.com"
    for idx, line in enumerate(lines[:8]):
        email_match = EMAIL_RE.search(line)
        if email_match:
            prefix = line[: email_match.start()].strip(" ,|–—-")
            name = _parse_name_words(prefix)
            if name and _looks_like_person_name(prefix, name):
                candidates.append((float(idx), name[0], name[1]))

    # 2) Dedicated name lines near top
    for idx, line in enumerate(lines[:12]):
        if EMAIL_RE.search(line) or PHONE_RE.search(line) or "http" in line.lower():
            continue
        if "|" in line and "@" in line:
            continue
        name = _parse_name_words(line)
        if name and _looks_like_person_name(line, name):
            score = float(idx)
            if email:
                local = email.split("@", 1)[0].lower()
                if name[0].lower() in local or (name[1] and name[1].split()[0].lower() in local):
                    score -= 5.0
            candidates.append((score, name[0], name[1]))

    # 3) Derive from email local part
    if email:
        from_email = _name_from_email(email)
        if from_email:
            candidates.append((20.0, from_email[0], from_email[1]))

    if not candidates:
        return None, None

    candidates.sort(key=lambda c: c[0])
    _, first, last = candidates[0]
    return first, last


def _parse_name_words(text: str) -> tuple[str, str] | None:
    text = text.split("|")[0].strip()
    cleaned = re.sub(r"[^A-Za-z\s\-'.]", " ", text).strip()
    words = [w.strip("'.") for w in cleaned.split() if w.strip("'.")]
    words = [w for w in words if w and w[0].isalpha()]
    if not 2 <= len(words) <= 4:
        return None
    first = words[0].title()
    last = " ".join(w.title() for w in words[1:])
    return first, last


def _looks_like_person_name(line: str, name: tuple[str, str]) -> bool:
    lower = line.lower()
    first, last = name

    if JOB_TITLE_RE.search(line) or SENIORITY_RE.search(line):
        return False
    if any(phrase in lower for phrase in ROLE_PHRASES):
        return False
    if COMPANY_HINTS_RE.search(line) or INSTITUTION_RE.search(line):
        return False
    if " at " in lower or DATE_LIKE.search(line):
        return False

    words = lower.replace("|", " ").split()
    if any(w in NOT_NAME_WORDS or w in SECTION_WORDS for w in words):
        return False
    if any(w.lower() in COMMON_SKILLS for w in line.split()):
        return False

    # Person names rarely contain job-title tokens in the last name
    last_lower = last.lower()
    if any(t in last_lower for t in ("engineer", "developer", "manager", "analyst", "software")):
        return False

    # Reject if line is mostly uppercase section header style (except ALL CAPS names)
    alpha = [c for c in line if c.isalpha()]
    if alpha and sum(c.isupper() for c in alpha) / len(alpha) > 0.85:
        return len(words) <= 4 and not any(w in NOT_NAME_WORDS for w in words)

    return True


def _name_from_email(email: str) -> tuple[str, str] | None:
    local = email.split("@", 1)[0].lower()
    local = re.sub(r"\d+$", "", local)
    parts = re.split(r"[._-]+", local)
    parts = [p for p in parts if len(p) >= 2 and p.isalpha()]
    if len(parts) >= 2:
        return parts[0].title(), parts[-1].title()
    return None


def _guess_address(lines: list[str]) -> PartialAddress | None:
    zip_address = _address_from_zip(lines)
    if zip_address:
        return zip_address
    # "Pune, India | email | phone" — city/country in the contact header
    for line in lines[:8]:
        for part in line.split("|"):
            part = part.strip(" ,")
            if not part or REMOTE_RE.match(part):
                continue
            if is_probable_location(part):
                pieces = [p.strip() for p in part.split(",")]
                last = pieces[-1]
                if len(last) == 2 and last.isupper():  # "Austin, TX"
                    return PartialAddress(
                        city=pieces[0], state=last, country="United States"
                    )
                return PartialAddress(
                    city=pieces[0],
                    state=pieces[1] if len(pieces) == 3 else None,
                    country=last,
                )
    return None


def _address_from_zip(lines: list[str]) -> PartialAddress | None:
    for line in lines[:20]:
        z = ZIP_RE.search(line)
        if not z:
            continue
        postal = z.group(1)
        before = line[: z.start()].strip(" ,|")
        parts = [p.strip() for p in re.split(r"[,|]", before) if p.strip()]
        # Drop contact tokens that share the line (email, phone, URLs)
        parts = [
            p
            for p in parts
            if not EMAIL_RE.search(p) and not PHONE_RE.search(p) and "http" not in p.lower()
        ]
        if len(parts) >= 2:
            return PartialAddress(
                line1=", ".join(parts[:-2]) if len(parts) > 2 else None,
                city=parts[-2],
                state=parts[-1],
                postal_code=postal,
                country="United States",
            )
    return None
