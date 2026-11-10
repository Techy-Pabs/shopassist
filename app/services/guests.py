"""Guest chat: who may send, and how many questions a guest has left.

The limits protect the free AI quota. Questions are counted from the
messages saved in the database, not from counters in memory, so they
survive a restart and can't drift.
"""
import math
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Conversation, Message, User
from app.services.admin_queries import range_bounds

# Taken (and held until the transaction ends) by every guest message before
# its limits are checked, so two messages sent at the same moment can't both
# slip under a limit. Any fixed number works; it only has to be the same.
GUEST_SEND_LOCK = 7_250_001

PACE_WINDOW = timedelta(minutes=1)


class GuestChatError(Exception):
    """Sent to the client as {"detail": message, "code": code}, with
    Retry-After when waiting would help (see app/main.py)."""

    def __init__(self, status_code: int, code: str, message: str, retry_after: int | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retry_after = retry_after


def now() -> datetime:
    # A function, so tests can move "now" to either side of midnight
    return datetime.now(settings.store_zone)


def ensure_guest_chat_on() -> None:
    if not settings.guest_chat_enabled:
        raise GuestChatError(403, "guest_chat_disabled", "Guest chat is turned off. Sign in or create an account to chat.")


def questions_used(db: Session, user: User) -> int:
    return db.scalar(
        select(func.count(Message.id))
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.user_id == user.id, Message.role == "user")
    )


def questions_left(db: Session, user: User) -> int:
    return max(0, settings.guest_message_limit - questions_used(db, user))


def guest_questions_since(db: Session, since: datetime) -> int:
    return db.scalar(
        select(func.count(Message.id))
        .join(Conversation, Conversation.id == Message.conversation_id)
        .join(User, User.id == Conversation.user_id)
        .where(User.is_guest, Message.role == "user", Message.created_at >= since)
    )


def check_guest_can_send(db: Session, user: User) -> None:
    """Raise GuestChatError if this guest may not send another message now.

    Call it in the transaction that then saves the message: the lock it
    takes is released when that transaction commits.
    """
    ensure_guest_chat_on()
    db.execute(select(func.pg_advisory_xact_lock(GUEST_SEND_LOCK)))

    if questions_used(db, user) >= settings.guest_message_limit:
        raise GuestChatError(
            429, "guest_limit_reached",
            f"You've used your {settings.guest_message_limit} guest questions. "
            "Create a free account or sign in to keep chatting.",
        )

    current = now()
    _, today, tomorrow = range_bounds("today", settings.store_zone, current)
    if guest_questions_since(db, today) >= settings.guest_daily_limit:
        raise GuestChatError(
            429, "guest_daily_limit_reached",
            "Guest chat is busy today. Sign in or create a free account to keep going, or try again tomorrow.",
            retry_after=math.ceil((tomorrow - current).total_seconds()),
        )

    # The database's clock, like the messages' created_at
    db_now = db.scalar(select(func.now()))
    recent = db.scalars(
        select(Message.created_at)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.user_id == user.id, Message.role == "user", Message.created_at > db_now - PACE_WINDOW)
        .order_by(Message.created_at)
    ).all()
    if len(recent) >= settings.guest_messages_per_minute:
        raise GuestChatError(
            429, "guest_too_fast",
            "You're sending messages very quickly. Please wait a moment and try again.",
            retry_after=max(1, math.ceil((recent[0] + PACE_WINDOW - db_now).total_seconds())),
        )
