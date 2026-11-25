from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conversation import Conversation
    from app.models.message_source import MessageSource

# What became of an assistant reply (see app/services/outcomes.py). Messages
# saved before outcomes existed, and customer messages, have none.
OUTCOME_ANSWERED = "answered"
OUTCOME_NO_INFO = "no_info"

# Whether a customer's question got its reply:
# - "sending": a request is getting its reply right now (since sending_since)
# - "sent": answered
# - "failed": the AI couldn't answer, so it's kept with no reply until it's
#   retried (the same message is answered then, never saved again)
# Replies are always "sent".
STATUS_SENT = "sent"
STATUS_SENDING = "sending"
STATUS_FAILED = "failed"


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="role_valid"),
        CheckConstraint("outcome IS NULL OR outcome IN ('answered', 'no_info')", name="outcome_valid"),
        # Only the assistant's replies have an outcome
        CheckConstraint("outcome IS NULL OR role = 'assistant'", name="outcome_only_for_replies"),
        CheckConstraint("status IN ('sent', 'sending', 'failed')", name="status_valid"),
        # Only a customer's question can be waiting for a reply
        CheckConstraint("status = 'sent' OR role = 'user'", name="unsent_only_for_questions"),
        # sending_since says when the current attempt started, only while sending
        CheckConstraint("(status = 'sending') = (sending_since IS NOT NULL)", name="sending_since_while_sending"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    outcome: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default=STATUS_SENT, server_default=STATUS_SENT)
    # When the request getting this question's reply started. A question still
    # "sending" long after that was left by a request that died: it counts as
    # failed, so it can be retried (see app/routers/conversations.py)
    sending_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
    # The documents a reply was written from (deleted with the message)
    sources: Mapped[list["MessageSource"]] = relationship(
        back_populates="message",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="MessageSource.id",
    )
