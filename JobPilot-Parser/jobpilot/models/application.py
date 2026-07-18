"""Shared enums and form sections for candidate job-application data."""

from __future__ import annotations

from datetime import date
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class PhoneType(str, Enum):
    MOBILE = "mobile"
    HOME = "home"
    WORK = "work"


class DegreeLevel(str, Enum):
    HIGH_SCHOOL = "high_school"
    ASSOCIATE = "associate"
    BACHELORS = "bachelors"
    MASTERS = "masters"
    MBA = "mba"
    PHD = "doctorate"
    BOOTCAMP = "bootcamp"
    CERTIFICATE = "certificate"
    OTHER = "other"


class WorkAuthorizationStatus(str, Enum):
    US_CITIZEN = "us_citizen"
    PERMANENT_RESIDENT = "permanent_resident"
    WORK_VISA = "work_visa"
    STUDENT_VISA = "student_visa"
    NEED_SPONSORSHIP = "need_sponsorship"
    NOT_AUTHORIZED = "not_authorized"
    OTHER = "other"


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    NON_BINARY = "non_binary"
    PREFER_NOT_TO_SAY = "prefer_not_to_say"
    OTHER = "other"


class VeteranStatus(str, Enum):
    NOT_VETERAN = "not_veteran"
    VETERAN = "veteran"
    ACTIVE_DUTY = "active_duty"
    PREFER_NOT_TO_SAY = "prefer_not_to_say"


class DisabilityStatus(str, Enum):
    YES = "yes"
    NO = "no"
    PREFER_NOT_TO_SAY = "prefer_not_to_say"


class WorkAuthorization(BaseModel):
    """Legal eligibility — required on most enterprise ATS forms."""

    status: WorkAuthorizationStatus
    requires_sponsorship_now: bool | None = None
    requires_sponsorship_future: bool | None = None
    authorized_countries: list[str] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=1000)


class Demographics(BaseModel):
    """Optional EEO fields — only submit when user opts in."""

    gender: Gender | None = None
    ethnicity: str | None = Field(default=None, max_length=100)
    veteran_status: VeteranStatus | None = None
    disability_status: DisabilityStatus | None = None
    consent_to_share: bool = False


class FileAttachment(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    content_type: str = Field(..., examples=["application/pdf"])
    content_base64: str | None = None
    storage_path: str | None = None
    label: str | None = Field(default=None, description="resume, cover_letter, transcript")


class CustomAnswer(BaseModel):
    """Pre-written answers to common screening questions."""

    question_id: str | None = None
    question_text: str = Field(..., min_length=1, max_length=2000)
    answer_type: str = Field(
        default="text",
        description="text | boolean | number | single_select | multi_select | date | file",
    )
    answer: str | bool | int | float | list[str] | None = None


class LegalConsent(BaseModel):
    privacy_policy_accepted: bool = False
    terms_accepted: bool = False
    background_check_consent: bool | None = None
    marketing_opt_in: bool | None = None


class ApplicationPreferences(BaseModel):
    """Common optional questions on careers pages."""

    willing_to_relocate: bool | None = None
    remote_preference: str | None = Field(default=None, description="remote | hybrid | onsite")
    desired_salary: str | None = Field(default=None, max_length=100)
    salary_currency: str | None = Field(default="USD", max_length=10)
    available_start_date: date | None = None
    notice_period_days: int | None = Field(default=None, ge=0, le=365)
    referral_source: str | None = None
    referred_by: str | None = None
    years_of_experience: float | None = Field(default=None, ge=0, le=60)
