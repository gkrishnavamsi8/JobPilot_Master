"""Flexible candidate models for partial saves and resume auto-fill."""

from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl

from jobpilot.models.application import (
    ApplicationPreferences,
    CustomAnswer,
    Demographics,
    DegreeLevel,
    FileAttachment,
    LegalConsent,
    PhoneType,
    WorkAuthorization,
)


class PartialAddress(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    line1: str | None = None
    line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None


class PartialPhone(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    number: str | None = None
    type: PhoneType = PhoneType.MOBILE
    country_code: str | None = None


class PartialSocial(BaseModel):
    linkedin: HttpUrl | str | None = None
    github: HttpUrl | str | None = None
    portfolio: HttpUrl | str | None = None
    twitter: HttpUrl | str | None = None
    website: HttpUrl | str | None = None
    other: dict[str, str] = Field(default_factory=dict)


class PartialProfile(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    first_name: str | None = None
    last_name: str | None = None
    preferred_name: str | None = None
    email: EmailStr | str | None = None
    phone: PartialPhone | None = None
    address: PartialAddress | None = None
    social: PartialSocial = Field(default_factory=PartialSocial)
    summary: str | None = None
    skills: list[str] = Field(default_factory=list)


class PartialWorkExperience(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    company: str | None = None
    title: str | None = None
    location: str | None = None
    start_date: date | str | None = None
    end_date: date | str | None = None
    is_current: bool = False
    description: str | None = None
    employment_type: str | None = None


class PartialEducation(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    school: str | None = None
    degree: DegreeLevel | str | None = None
    field_of_study: str | None = None
    start_date: date | str | None = None
    end_date: date | str | None = None
    gpa: str | None = None
    is_current: bool = False


class CandidateData(BaseModel):
    """
    Everything needed to fill job application forms (Greenhouse, Workday, etc.).

    Resume parser auto-fills profile, experience, education, skills.
    User completes the rest in the UI once — reused for every application.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    # Identity & contact (required on virtually every careers page)
    profile: PartialProfile | None = None

    # Employment & education history
    work_experience: list[PartialWorkExperience] = Field(default_factory=list)
    education: list[PartialEducation] = Field(default_factory=list)

    # Visa / sponsorship (Workday, Greenhouse screening)
    work_authorization: WorkAuthorization | None = None

    # Optional EEO — only if user opts in
    demographics: Demographics | None = None

    # Salary, relocation, start date, referral source
    preferences: ApplicationPreferences = Field(default_factory=ApplicationPreferences)

    # Privacy / terms checkboxes
    legal: LegalConsent = Field(default_factory=LegalConsent)

    # Pre-written answers to common screening questions
    custom_answers: list[CustomAnswer] = Field(default_factory=list)

    # Documents (resume stored on disk + metadata here)
    cover_letter: FileAttachment | None = None
    additional_files: list[FileAttachment] = Field(default_factory=list)

    metadata: dict[str, Any] = Field(default_factory=dict)


class ParsedResumeResult(BaseModel):
    """Output from resume parser — used to auto-fill the UI."""

    extracted: CandidateData
    filled_fields: list[str] = Field(
        default_factory=list,
        description="Dot-paths of fields the parser populated",
    )
    raw_text_preview: str | None = Field(
        default=None,
        description="First ~500 chars of extracted text for debugging",
    )
