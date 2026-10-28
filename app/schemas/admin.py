from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

Item = TypeVar("Item")


class Page(BaseModel, Generic[Item]):
    """One page of a list. total says how many there are in all."""

    items: list[Item]
    total: int
    limit: int
    offset: int


class AdminUser(BaseModel):
    # No password hash: only these fields are ever sent
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: str
    created_at: datetime


class AdminConversation(BaseModel):
    id: int
    title: str | None
    user_id: int
    owner_email: str
    message_count: int
    created_at: datetime


class ConversationResolution(BaseModel):
    """A conversation's resolved state, after resolving or reopening it."""

    id: int
    # Both None when the conversation is open
    resolved_at: datetime | None
    resolved_by: int | None


class AdminDocument(BaseModel):
    id: int
    title: str
    source: str
    # "folder" (a file in knowledge/) or "upload" (uploaded by an admin)
    source_type: str
    # Uploads only: the cleaned original file name and the admin who uploaded it
    original_filename: str | None
    uploaded_by: int | None
    chunk_count: int
    # Every model used by this document's chunks (more than one part way through a re-embed)
    embedding_models: list[str]
    # True when any chunk was made by a model other than EMBEDDING_MODEL
    stale: bool
    updated_at: datetime


class ChunkPreview(BaseModel):
    chunk_index: int
    # The start of the chunk's text (at most PREVIEW_CHARS characters)
    content: str


class AdminDocumentDetail(AdminDocument):
    size_bytes: int | None
    created_at: datetime
    # The first few chunks, shortened
    preview: list[ChunkPreview]


class UploadedDocument(AdminDocument):
    size_bytes: int
    # Embedding requests this upload used (counts against the daily free quota)
    embedding_requests: int


class AdminStats(BaseModel):
    users: int
    conversations: int
    messages: int
    documents: int
    chunks: int
