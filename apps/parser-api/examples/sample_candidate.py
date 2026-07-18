"""Example candidate profile — all fields used to fill job application forms."""

from __future__ import annotations

import json

from jobpilot.models.application import WorkAuthorization, WorkAuthorizationStatus
from jobpilot.models.candidate import (
    ApplicationPreferences,
    CandidateData,
    PartialAddress,
    PartialPhone,
    PartialProfile,
    PartialSocial,
    PartialWorkExperience,
)

EXAMPLE = CandidateData(
    profile=PartialProfile(
        first_name="Jane",
        last_name="Doe",
        email="jane.doe@example.com",
        phone=PartialPhone(number="+1 555-0100"),
        address=PartialAddress(
            line1="100 Market St",
            city="San Francisco",
            state="CA",
            postal_code="94105",
            country="United States",
        ),
        social=PartialSocial(linkedin="https://linkedin.com/in/janedoe"),
        skills=["Python", "FastAPI", "PostgreSQL"],
    ),
    work_experience=[
        PartialWorkExperience(
            company="Acme Corp",
            title="Software Engineer",
            start_date="2021-03-01",
            is_current=True,
        )
    ],
    work_authorization=WorkAuthorization(
        status=WorkAuthorizationStatus.US_CITIZEN,
        requires_sponsorship_now=False,
    ),
    preferences=ApplicationPreferences(
        willing_to_relocate=True,
        desired_salary="120000",
        years_of_experience=5,
    ),
    custom_answers=[
        {
            "question_text": "Why do you want to work here?",
            "answer": "I'm excited about building great products.",
        }
    ],
)


if __name__ == "__main__":
    print(json.dumps(EXAMPLE.model_dump(mode="json"), indent=2))
