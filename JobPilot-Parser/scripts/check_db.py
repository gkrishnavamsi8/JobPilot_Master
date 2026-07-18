"""Test database connection. Run: python scripts/check_db.py"""

from sqlalchemy.engine import make_url

from jobpilot.config import settings
from jobpilot.db.session import check_db_connection, init_db


def main() -> None:
    display_url = settings.database_url
    if settings.is_postgres:
        display_url = make_url(settings.database_url).render_as_string(hide_password=True)

    print(f"Connecting to: {display_url}")
    check_db_connection()
    print("Connection OK")

    init_db()
    print("Tables created/verified (candidates)")


if __name__ == "__main__":
    main()
