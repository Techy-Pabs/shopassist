from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserResponse(BaseModel):
    # from_attributes lets this be built straight from a User model object.
    # Only these fields are sent back, so the password hash never is.
    model_config = ConfigDict(from_attributes=True)

    id: int
    # None for guests, who have no account
    email: str | None
    role: str
    is_guest: bool
    created_at: datetime


class MeResponse(UserResponse):
    # Guests only: customer messages they can still send (GUEST_MESSAGE_LIMIT
    # minus those sent). None for accounts, which have no limit.
    questions_left: int | None = None
    # Guests only: how many they could send in all (GUEST_MESSAGE_LIMIT)
    question_limit: int | None = None
