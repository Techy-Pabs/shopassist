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
    # The latest assistant reply, shortened (None if there is none yet). Never
    # the customer's own question.
    last_reply_preview: str | None
    # True when the latest message is a question whose reply failed: the chat
    # shows "Waiting for a reply"
    last_message_failed: bool
    # Kept so a chat built before last_reply_preview keeps working while both
    # are deployed: the latest message, whoever wrote it, as before
    last_message_preview: str | None = Field(
        deprecated="Use last_reply_preview and last_message_failed. The latest message, which may be the customer's own question.",
    )
