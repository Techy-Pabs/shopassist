from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, false, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conversation import Conversation

ROLE_CUSTOMER = "customer"
ROLE_ADMIN = "admin"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('customer', 'admin')", name="role_valid"),
        # An account always has an email and a password; only guests go without
        CheckConstraint("is_guest OR (email IS NOT NULL AND hashed_password IS NOT NULL)", name="account_has_credentials"),
        # A guest has neither, and is never an admin
        CheckConstraint(
            "NOT is_guest OR (email IS NULL AND hashed_password IS NULL AND role = 'customer')",
            name="guest_is_anonymous_customer",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Both NULL for guests (see the CHECK constraints above)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255))
    # A visitor chatting without an account (POST /auth/guest). Deleted after
    # GUEST_RETENTION_DAYS by python -m app.cli.guests
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # Everyone starts as a customer; admins are made with python -m app.cli.users
    role: Mapped[str] = mapped_column(String(20), default=ROLE_CUSTOMER, server_default=ROLE_CUSTOMER)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="user", foreign_keys="Conversation.user_id"
    )
