"""Account auth: PBKDF2 password hashing + HMAC-signed bearer tokens.

Stdlib-only so no extra dependencies are needed. Tokens are compact
`base64url(payload).base64url(signature)` pairs with an expiry timestamp,
signed with ``settings.secret_key``.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

from sqlalchemy.orm import Session

from jobpilot.config import settings
from jobpilot.db.models import UserRecord

_PBKDF2_ITERATIONS = 240_000
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_hex, digest_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def _sign(payload: bytes) -> str:
    return _b64encode(
        hmac.new(settings.secret_key.encode(), payload, hashlib.sha256).digest()
    )


def create_token(user_id: str) -> str:
    payload = json.dumps(
        {"uid": user_id, "exp": int(time.time()) + TOKEN_TTL_SECONDS},
        separators=(",", ":"),
    ).encode()
    return f"{_b64encode(payload)}.{_sign(payload)}"


def decode_token(token: str) -> str | None:
    """Return the user id for a valid, unexpired token; None otherwise."""
    try:
        payload_b64, signature = token.split(".")
        payload = _b64decode(payload_b64)
    except (ValueError, TypeError):
        return None
    if not hmac.compare_digest(_sign(payload), signature):
        return None
    try:
        claims = json.loads(payload)
    except json.JSONDecodeError:
        return None
    if not isinstance(claims, dict) or claims.get("exp", 0) < time.time():
        return None
    uid = claims.get("uid")
    return uid if isinstance(uid, str) else None


# ---------------------------------------------------------------------------
# User persistence
# ---------------------------------------------------------------------------


def get_user_by_email(db: Session, email: str) -> UserRecord | None:
    return db.query(UserRecord).filter(UserRecord.email == email.lower().strip()).first()


def get_user(db: Session, user_id: str) -> UserRecord | None:
    return db.get(UserRecord, user_id)


def create_user(db: Session, email: str, password: str, full_name: str | None) -> UserRecord:
    record = UserRecord(
        email=email.lower().strip(),
        full_name=(full_name or "").strip() or None,
        password_hash=hash_password(password),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def user_to_response(user: UserRecord) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "created_at": user.created_at.isoformat(),
    }
