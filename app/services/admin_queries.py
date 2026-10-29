"""The admin dashboard's queries.

Every number comes from an aggregate query: lists are one statement per
page (however many rows), never one query per row.
"""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import Select, case, exists, func, or_, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Conversation, Document, Message, User
from app.models.message import OUTCOME_NO_INFO
from app.models.user import ROLE_CUSTOMER

# Why a conversation needs attention
REASON_UNANSWERED = "unanswered"
REASON_COULDNT_ANSWER = "couldnt_answer"
# A conversation's status
STATUS_OPEN = "open"
STATUS_NEEDS_ATTENTION = "needs_attention"
STATUS_RESOLVED = "resolved"

# Days in each stats range (today counts as one of them)
RANGE_DAYS = {"today": 1, "7d": 7, "30d": 30}


def like_pattern(q: str) -> str:
    """A LIKE pattern matching q anywhere, with q's own % and _ taken literally.

    Used with a bound parameter and escape="\\", never pasted into SQL.
    """
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


# Per conversation: how many messages, and when the latest was written
_message_stats = (
    select(
        Message.conversation_id.label("conversation_id"),
        func.count(Message.id).label("message_count"),
        func.max(Message.created_at).label("last_message_at"),
    )
    .group_by(Message.conversation_id)
    .subquery("message_stats")
)

# The role of the conversation's latest message ("user" means no reply yet)
_latest_role = (
    select(Message.role)
    .where(Message.conversation_id == Conversation.id)
    .order_by(Message.created_at.desc(), Message.id.desc())
    .limit(1)
    .correlate(Conversation)
    .scalar_subquery()
)

# A "couldn't answer" reply since the conversation was last resolved
_has_new_no_info = (
    exists()
    .where(
        Message.conversation_id == Conversation.id,
        Message.outcome == OUTCOME_NO_INFO,
        or_(Conversation.last_resolved_at.is_(None), Message.created_at > Conversation.last_resolved_at),
    )
    .correlate(Conversation)
)

message_count = func.coalesce(_message_stats.c.message_count, 0)
last_activity = func.coalesce(_message_stats.c.last_message_at, Conversation.created_at)

# Needs attention: not resolved, and the latest customer message has no reply
# (unanswered), or there is a "couldn't answer" reply since the last resolution.
# Unanswered comes first, so the two reasons never overlap.
attention_reason = case(
    (Conversation.resolved_at.is_not(None), None),
    (_latest_role == "user", REASON_UNANSWERED),
    (_has_new_no_info, REASON_COULDNT_ANSWER),
    else_=None,
)
status = case(
    (Conversation.resolved_at.is_not(None), STATUS_RESOLVED),
    (attention_reason.is_not(None), STATUS_NEEDS_ATTENTION),
    else_=STATUS_OPEN,
)


def conversation_summaries() -> Select:
    """Every conversation with its customer, counts and status, newest activity first."""
    return (
        select(
            Conversation,
            User.email.label("owner_email"),
            message_count.label("message_count"),
            last_activity.label("last_activity"),
            status.label("status"),
            attention_reason.label("attention_reason"),
        )
        .join(User, Conversation.user_id == User.id)
        .outerjoin(_message_stats, _message_stats.c.conversation_id == Conversation.id)
        .order_by(last_activity.desc(), Conversation.id.desc())
    )


def search_conversations(query: Select, q: str) -> Select:
    """Conversations whose customer email, or any customer question, contains q."""
    pattern = like_pattern(q)
    asked = exists().where(
        Message.conversation_id == Conversation.id,
        Message.role == "user",
        Message.content.ilike(pattern, escape="\\"),
    )
    return query.where(or_(User.email.ilike(pattern, escape="\\"), asked))


def filter_conversations(query: Select, conversation_filter: str) -> Select:
    if conversation_filter == "attention":
        return query.where(attention_reason.is_not(None))
    if conversation_filter == "resolved":
        return query.where(Conversation.resolved_at.is_not(None))
    return query


def conversation_counts(db: Session, query: Select) -> dict[str, int]:
    """How many conversations are in each filter tab, in one query."""
    rows = query.order_by(None).subquery()
    all_, attention, resolved = db.execute(
        select(
            func.count(),
            func.count().filter(rows.c.status == STATUS_NEEDS_ATTENTION),
            func.count().filter(rows.c.status == STATUS_RESOLVED),
        ).select_from(rows)
    ).one()
    return {"all": all_, "attention": attention, "resolved": resolved}


def range_bounds(range_name: str, zone: ZoneInfo, now: datetime | None = None) -> tuple[datetime, datetime, datetime]:
    """(previous period start, this period start, end of today), as local midnights in zone.

    "today" starts at midnight in the store's time zone; "7d" is today and
    the 6 days before it. The previous period is the same length, just before.
    """
    today = (now or datetime.now(zone)).astimezone(zone).date()
    days = RANGE_DAYS[range_name]

    def midnight(day):
        return datetime.combine(day, time.min, tzinfo=zone)

    since = today - timedelta(days=days - 1)
    return midnight(since - timedelta(days=days)), midnight(since), midnight(today + timedelta(days=1))


def stats(db: Session, range_name: str) -> dict:
    zone = settings.store_zone
    previous_since, since, until = range_bounds(range_name, zone)

    # Conversations in this period and the one before
    conversations, previous = db.execute(
        select(
            func.count().filter(Conversation.created_at >= since),
            func.count().filter(Conversation.created_at < since),
        ).where(Conversation.created_at >= previous_since, Conversation.created_at < until)
    ).one()

    # Customer questions, and replies that answered (not "couldn't answer";
    # replies saved before outcomes existed count as answered)
    questions, answered = db.execute(
        select(
            func.count().filter(Message.role == "user"),
            func.count().filter(Message.role == "assistant", Message.outcome.is_distinct_from(OUTCOME_NO_INFO)),
        ).where(Message.created_at >= since, Message.created_at < until)
    ).one()

    # Needs attention right now (not limited to the period: it is a to-do list)
    summaries = conversation_summaries().order_by(None).subquery()
    unanswered, couldnt_answer = db.execute(
        select(
            func.count().filter(summaries.c.attention_reason == REASON_UNANSWERED),
            func.count().filter(summaries.c.attention_reason == REASON_COULDNT_ANSWER),
        ).select_from(summaries)
    ).one()

    documents, last_updated = db.execute(select(func.count(Document.id), func.max(Document.updated_at))).one()
    customers = db.scalar(select(func.count(User.id)).where(User.role == ROLE_CUSTOMER))

    # One row per day of the period, including days with no conversations. A
    # conversation's day is its date in the store's time zone (so daylight
    # saving changes are handled by PostgreSQL, not by adding 24 hours).
    per_day = db.execute(
        text(
            "SELECT d.day::date AS day, count(c.id) AS conversations "
            "FROM generate_series(CAST(:first_day AS date), CAST(:last_day AS date), interval '1 day') AS d(day) "
            "LEFT JOIN conversations c ON c.created_at >= :since AND c.created_at < :until "
            "AND (c.created_at AT TIME ZONE :zone)::date = d.day::date "
            "GROUP BY d.day ORDER BY d.day"
        ),
        {
            "first_day": since.date(), "last_day": (until - timedelta(days=1)).date(),
            "since": since, "until": until, "zone": settings.store_timezone,
        },
    ).all()

    return {
        "range": range_name,
        "time_zone": settings.store_timezone,
        "since": since,
        "conversations": conversations,
        "previous_conversations": previous,
        "questions": questions,
        "answered": answered,
        "needs_attention": {
            "total": unanswered + couldnt_answer, "unanswered": unanswered, "couldnt_answer": couldnt_answer,
        },
        "knowledge": {"documents": documents, "last_updated": last_updated},
        "customers": customers,
        "per_day": [{"day": day, "conversations": n} for day, n in per_day],
    }


# Per user: conversations, and when they last wrote
_user_conversations = (
    select(Conversation.user_id.label("user_id"), func.count(Conversation.id).label("conversation_count"))
    .group_by(Conversation.user_id)
    .subquery("user_conversations")
)
_user_last_message = (
    select(Conversation.user_id.label("user_id"), func.max(Message.created_at).label("last_active"))
    .join(Message, Message.conversation_id == Conversation.id)
    .where(Message.role == "user")
    .group_by(Conversation.user_id)
    .subquery("user_last_message")
)


def user_summaries() -> Select:
    """Every user with their conversation count and last activity, newest first.

    Only these columns: the password hash never leaves the database here.
    """
    return (
        select(
            User.id, User.email, User.role, User.created_at,
            func.coalesce(_user_conversations.c.conversation_count, 0).label("conversation_count"),
            _user_last_message.c.last_active.label("last_active"),
        )
        .outerjoin(_user_conversations, _user_conversations.c.user_id == User.id)
        .outerjoin(_user_last_message, _user_last_message.c.user_id == User.id)
        .order_by(User.created_at.desc(), User.id.desc())
    )


def customer_summary(db: Session, user_id: int) -> dict:
    """One customer's conversation, question and "couldn't answer" counts, in one query."""
    conversations, questions, couldnt_answer = db.execute(
        select(
            func.count(Conversation.id.distinct()),
            func.count(Message.id).filter(Message.role == "user"),
            func.count(Message.id).filter(Message.outcome == OUTCOME_NO_INFO),
        )
        .select_from(Conversation)
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id == user_id)
    ).one()
    return {"conversation_count": conversations, "questions_asked": questions, "couldnt_answer": couldnt_answer}

