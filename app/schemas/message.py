from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints


class MessageCreate(BaseModel):
    # Surrounding spaces are removed first, so "   " counts as empty
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    # "sent", or "failed": a question whose reply failed (retry it with
    # POST /conversations/{id}/messages/{message_id}/retry)
    status: str
    # A question still being answered ("sending"): the seconds until it
    # counts as failed and can be retried. The server's cut-off, so the chat
    # doesn't keep a number of its own. None otherwise.
    retry_in: int | None = None
    created_at: datetime
