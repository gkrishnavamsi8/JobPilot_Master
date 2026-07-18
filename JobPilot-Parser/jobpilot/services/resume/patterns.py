"""Shared regex patterns and keyword dictionaries for resume parsing."""

from __future__ import annotations

import re

EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_RE = re.compile(
    r"(?:\+91[\s.-]?[6-9]\d{9}|\+?\d{1,3}[\s.-]?)?(?:\(?\d{3,5}\)?[\s.-]?)\d{3,5}[\s.-]?\d{4,6}\b"
)
LINKEDIN_RE = re.compile(
    r"(https?://(?:www\.)?linkedin\.com/in/[A-Za-z0-9\-_%]+/?|"
    r"(?:www\.)?linkedin\.com/in/[A-Za-z0-9\-_%]+/?|"
    r"linkedin\.com/in/[A-Za-z0-9\-_%]+/?)",
    re.I,
)
GITHUB_RE = re.compile(
    r"((?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9\-_.]+/?)",
    re.I,
)
URL_RE = re.compile(r"https?://[^\s)>]+", re.I)
ZIP_RE = re.compile(r"\b(\d{5}(?:-\d{4})?)\b")
BULLET_RE = re.compile(r"^[\u2022\u2023\u25E6\u2043\u2219•\-\*▪►]\s*")

SINGLE_MONTH_DATE_RE = re.compile(
    r"^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}$",
    re.I,
)
DATE_RANGE_RE = re.compile(
    r"(?P<start>(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4"
    r"}|\d{1,2}[/-]\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4})\s*[-–—to]+\s*"
    r"(?P<end>(?:Present|Current|Now|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}[/-]\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}))",
    re.I,
)
YEAR_ONLY_RE = re.compile(r"^\d{4}$")

INSTITUTION_RE = re.compile(
    r"\b(university|college|institute|institution|school|academy|polytechnic|"
    r"vit\b|iit\b|nit\b|bits\b|mit\b|stanford|harvard|vellore)\b",
    re.I,
)

COMPANY_HINTS_RE = re.compile(
    r"\b(finance|finserv|bank|corp|corporation|ltd|limited|llc|inc|technologies|"
    r"tech|solutions|services|group|consulting|pvt|holdings|capital|bajaj|"
    r"infosys|tcs|wipro|accenture|amazon|google|microsoft|meta|apple)\b",
    re.I,
)

JOB_TITLE_RE = re.compile(
    r"\b(engineer|developer|architect|analyst|manager|director|consultant|intern|"
    r"specialist|associate|designer|administrator|coordinator|programmer|scientist|"
    r"tester|devops|sde|swe|lead)\b",
    re.I,
)

SENIORITY_RE = re.compile(
    r"\b(senior|junior|staff|principal|head|chief|vp|vice president|sr\.?|jr\.?)\b",
    re.I,
)

FIELD_OF_STUDY_RE = re.compile(
    r"\b(computer science(?:\s+(?:and|&)\s+engineering)?|information technology|data science|"
    r"mechanical engineering|"
    r"electrical engineering|electronics(?:\s+(?:and|&)\s+communication)?(?:\s+engineering)?|"
    r"civil engineering|chemical engineering|business administration|mathematics|physics|"
    r"chemistry|biology)\b",
    re.I,
)

ROLE_PHRASES = (
    "software",
    "full stack",
    "fullstack",
    "backend",
    "frontend",
    "data ",
    "product ",
    "machine learning",
    "cloud",
)

PROJECT_VERBS = (
    "engineered",
    "developed",
    "built",
    "implemented",
    "designed",
    "optimized",
    "created",
    "deployed",
    "maintained",
    "contributed",
    "leveraged",
    "utilized",
    "architected",
    "enhanced",
    "improved",
    "reduced",
    "increased",
    "automated",
    "integrated",
    "delivered",
    "migrated",
    "refactored",
    "streamlined",
    "spearheaded",
    "established",
    "launched",
    "published",
    "achieved",
    "analyzed",
    "collaborated",
    "partnered",
    "provided",
    "managed",
    "led ",
)

DEGREE_KEYWORDS: dict[str, str] = {
    "phd": "doctorate",
    "doctorate": "doctorate",
    "master": "masters",
    "mba": "mba",
    "bachelor": "bachelors",
    "b.tech": "bachelors",
    "btech": "bachelors",
    "b.e.": "bachelors",
    "b.e": "bachelors",
    "b.sc": "bachelors",
    "bsc": "bachelors",
    "m.tech": "masters",
    "mtech": "masters",
    "associate": "associate",
    "high school": "high_school",
    "certificate": "certificate",
    "bootcamp": "bootcamp",
}

MONTH_MAP = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

SECTION_ALIASES: dict[str, tuple[str, ...]] = {
    "experience": (
        "experience",
        "work experience",
        "professional experience",
        "professional background",
        "employment",
        "employment history",
        "work history",
        "career history",
        "internships",
        "internship experience",
    ),
    "education": ("education", "academic background", "qualifications", "academics"),
    "skills": (
        "skills",
        "technical skills",
        "core competencies",
        "technologies",
        "tools",
        "tech stack",
        "areas of expertise",
    ),
    "summary": (
        "summary",
        "professional summary",
        "career summary",
        "profile",
        "about me",
        "objective",
        "career objective",
    ),
    "projects": (
        "projects",
        "project",
        "personal projects",
        "key projects",
        "academic projects",
        "selected projects",
    ),
    "certifications": ("certifications", "certification", "licenses", "credentials", "courses"),
    "awards": ("awards", "achievements", "key achievements", "honors", "accomplishments"),
    "languages": ("languages", "language proficiency"),
    "volunteering": ("volunteering", "volunteer experience", "extracurricular activities"),
}

# Build header regexes: longest alias first so "work experience" wins over
# "experience"; \b keeps "Experienced in..." from matching; group(2) captures
# an explicit separator so callers can tell "SKILLS: Python" from prose.
SECTION_HEADER_RES: list[tuple[str, re.Pattern[str]]] = []
for section, aliases in SECTION_ALIASES.items():
    alt = "|".join(re.escape(a) for a in sorted(aliases, key=len, reverse=True))
    SECTION_HEADER_RES.append(
        (
            section,
            re.compile(rf"^({alt})\b\s*([.:\-–—])?\s*(.*)$", re.I),
        )
    )

# Only break on uppercase section titles; avoid splitting "TECHNICAL SKILLS"
SECTION_BREAK_RE = re.compile(
    r"(?<=\S)\s+(?=(?:"
    r"EDUCATION|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EMPLOYMENT|WORK HISTORY|"
    r"TECHNICAL SKILLS|(?<!TECHNICAL )SKILLS|PROJECTS|SUMMARY|CERTIFICATIONS|AWARDS|ACHIEVEMENTS|"
    r"(?<!TECHNICAL )(?<!WORK )(?<!PROFESSIONAL )EXPERIENCE"
    r")\b)",
)

# Note: no "/" here — it would butcher "CI/CD" and "OpenAPI/Swagger"
SKILL_SPLIT_RE = re.compile(r"[,|•·\n;]|(?:\s{2,})")

# "Pune, India" / "San Francisco, CA" / "Remote" / "Hyderabad, Telangana, India"
LOCATION_RE = re.compile(
    r"^(?:(?i:remote|hybrid|on[- ]?site|work from home|wfh))$"
    r"|^[A-Z][A-Za-z .'\-]{1,25}(?:,\s*[A-Z][A-Za-z .'\-]{1,25}){1,2}$"
)

# Countries + US state codes used to tell "Pune, India" (location) apart
# from "Amdocs, Pune" (company) — the last comma part must be a known region.
_COUNTRIES = (
    "india|usa|united states|u\\.s\\.a?\\.?|uk|united kingdom|canada|australia|germany|"
    "france|spain|italy|netherlands|ireland|singapore|japan|china|uae|"
    "united arab emirates|switzerland|sweden|norway|denmark|poland|brazil|mexico|"
    "argentina|south africa|nigeria|kenya|egypt|israel|turkey|russia|indonesia|"
    "malaysia|philippines|thailand|vietnam|south korea|new zealand|portugal|belgium|"
    "austria|finland|czech republic|romania|hungary|greece|colombia|chile|peru|"
    "bangladesh|pakistan|sri lanka|nepal|qatar|saudi arabia|kuwait|oman|bahrain"
)
_US_STATES = (
    "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|"
    "MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC"
)
KNOWN_REGION_RE = re.compile(rf"^(?:(?i:{_COUNTRIES})|{_US_STATES})$")
REMOTE_RE = re.compile(r"^(?:remote|hybrid|on[- ]?site|work from home|wfh)$", re.I)


def is_probable_location(text: str) -> bool:
    """True for "City, Country" / "City, ST" / "Remote" — not "Amdocs, Pune"."""
    text = text.strip()
    if REMOTE_RE.match(text):
        return True
    if not LOCATION_RE.match(text):
        return False
    last = text.rsplit(",", 1)[-1].strip().rstrip(".")
    return bool(KNOWN_REGION_RE.match(last))

GPA_RE = re.compile(
    r"\b(?:GPA|CGPA)\s*[:\-]?\s*(\d+(?:\.\d+)?(?:\s*/\s*\d+(?:\.\d+)?)?)",
    re.I,
)

EMPLOYMENT_TYPE_RE = re.compile(
    r"\b(full[- ]?time|part[- ]?time|contract|internship|intern|freelance|temporary)\b",
    re.I,
)

COMMON_SKILLS = frozenset(
    s.lower()
    for s in (
        "Python",
        "Java",
        "JavaScript",
        "TypeScript",
        "C++",
        "C#",
        "Go",
        "Rust",
        "SQL",
        "PostgreSQL",
        "MySQL",
        "MongoDB",
        "Redis",
        "Kafka",
        "Spark",
        "Docker",
        "Kubernetes",
        "AWS",
        "Azure",
        "GCP",
        "FastAPI",
        "Django",
        "Flask",
        "Spring Boot",
        "React",
        "Node.js",
        "REST",
        "GraphQL",
        "OAuth",
        "Git",
        "CI/CD",
        "Linux",
        "HTML",
        "CSS",
        "Tailwind",
        "Microservices",
        "Machine Learning",
        "TensorFlow",
        "PyTorch",
    )
)
