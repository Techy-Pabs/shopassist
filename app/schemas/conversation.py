from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str | None
    created_at: datetime


class ConversationListItem(BaseModel):
    id: int
    title: str | None
    created_at: datetime
    # Time of the latest message, or created_at if there are none
    updated_at: datetime
    # The latest message, shortened (None if there are no messages)
    last_message_preview: str | None
