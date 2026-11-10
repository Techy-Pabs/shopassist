"""Delete old guests and everything that belongs to them.

Usage:
    python -m app.cli.guests cleanup

Deletes guests created more than GUEST_RETENTION_DAYS ago, with their
conversations, messages and message sources. Accounts are never touched.
scripts/start.sh runs it every time the API starts, because Render's free
plan has no scheduled jobs.
"""

import argparse
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models import Conversation, User


def delete_old_guests(db: Session, now: datetime | None = None) -> tuple[int, int]:
    """Delete guests older than GUEST_RETENTION_DAYS. Returns (guests, conversations) deleted."""
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=settings.guest_retention_days)
    old_guests = select(User.id).where(User.is_guest, User.created_at < cutoff)
    # Conversations first: deleting them deletes their messages and message
    # sources too (ON DELETE CASCADE in the database). Then the guests.
    conversations = db.execute(
        delete(Conversation).where(Conversation.user_id.in_(old_guests)).execution_options(synchronize_session=False)
    ).rowcount
    guests = db.execute(
        delete(User).where(User.is_guest, User.created_at < cutoff).execution_options(synchronize_session=False)
    ).rowcount
    db.commit()
    return guests, conversations


def main() -> int:
    parser = argparse.ArgumentParser(description="Delete old ShopAssist guests.")
    parser.add_argument("action", choices=["cleanup"])
    parser.parse_args()

    with SessionLocal() as db:
        guests, conversations = delete_old_guests(db)
    print(f"Guest cleanup: deleted {guests} guests older than {settings.guest_retention_days} days, "
          f"and their {conversations} conversations.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
