from pathlib import Path
from urllib.parse import quote_plus, unquote

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _encode_postgres_password(url: str) -> str:
    """URL-encode passwords that contain @, #, etc. (common in Supabase passwords)."""
    for marker in ("@db.", "@aws-"):
        idx = url.find(marker)
        if idx == -1:
            continue
        scheme_end = url.find("://")
        if scheme_end == -1:
            return url
        scheme_end += 3
        user_pass = url[scheme_end:idx]
        if ":" not in user_pass:
            return url
        user, password = user_pass.split(":", 1)
        encoded = quote_plus(unquote(password))
        if encoded == password:
            return url
        return f"{url[:scheme_end]}{user}:{encoded}@{url[idx + 1:]}"
    return url


def normalize_database_url(url: str) -> str:
    """Convert Supabase/Heroku-style URLs to SQLAlchemy + psycopg format."""
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://") and "+psycopg" not in url and "+psycopg2" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)

    if url.startswith("postgresql"):
        url = _encode_postgres_password(url)

    if "supabase.co" in url or "supabase.com" in url:
        if "sslmode=" not in url:
            url = f"{url}{'&' if '?' in url else '?'}sslmode=require"

    return url

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Set DATABASE_URL in .env — Supabase: Project Settings → Database → Connection string
    database_url: str = "sqlite:///./data/jobpilot.db"
    upload_dir: Path = Path("./data/uploads")

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_db_url(cls, value: str) -> str:
        if isinstance(value, str):
            return normalize_database_url(value)
        return value

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")

    def ensure_dirs(self) -> None:
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        if self.is_sqlite:
            db_path = self.database_url.replace("sqlite:///", "")
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)


settings = Settings()
