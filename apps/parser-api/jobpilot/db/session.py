from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from jobpilot.config import settings
from jobpilot.db.models import Base

_engine_kwargs: dict = {}
if settings.is_sqlite:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # Supabase / Postgres: recover from dropped idle connections
    _engine_kwargs["pool_pre_ping"] = True
    _engine_kwargs["pool_recycle"] = 300

engine = create_engine(settings.database_url, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    settings.ensure_dirs()
    Base.metadata.create_all(bind=engine)
    _apply_light_migrations()


def _apply_light_migrations() -> None:
    """Add columns introduced after a table already exists (create_all won't)."""
    with engine.begin() as conn:
        if settings.is_sqlite:
            cols = {
                row[1]
                for row in conn.exec_driver_sql("PRAGMA table_info(candidates)")
            }
            if cols and "user_id" not in cols:
                conn.exec_driver_sql("ALTER TABLE candidates ADD COLUMN user_id CHAR(32)")
        else:
            conn.exec_driver_sql(
                "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS user_id UUID"
            )


def check_db_connection() -> None:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
