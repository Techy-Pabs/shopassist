from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.message import Message
    from app.models.user import User


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        # Who resolved it is only kept while it is resolved
        CheckConstraint("resolved_by IS NULL OR resolved_at IS NOT NULL", name="resolved_by_needs_resolved_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # Set when an admin marks it resolved; cleared on reopening, or when the
    # customer writes again (it needs attention again)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    # Two links to users (the customer, and who resolved it), so each names its column
    user: Mapped["User"] = relationship(back_populates="conversations", foreign_keys=[user_id])
    # Deleting a conversation deletes its messages, both in Python
    # (cascade) and in the database (ondelete="CASCADE" on Message).
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Message.created_at",
    )
