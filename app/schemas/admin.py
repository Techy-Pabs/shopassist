from datetime import date, datetime
from typing import Generic, Literal, TypeVar

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
    # When they joined
    created_at: datetime
    conversation_count: int
    # When they last wrote a message; None if they never have
    last_active: datetime | None


Status = Literal["open", "needs_attention", "resolved"]
# Why it needs attention: the latest question has no reply, or a reply
# couldn't answer since the conversation was last resolved
AttentionReason = Literal["unanswered", "couldnt_answer"]


class AdminConversation(BaseModel):
    id: int
    title: str | None
    user_id: int
    owner_email: str
    message_count: int
    created_at: datetime
    # The latest message's time (or when it was started, if it has none)
    last_activity: datetime
    status: Status
    attention_reason: AttentionReason | None
    resolved_at: datetime | None


class ConversationCounts(BaseModel):
    """How many conversations each filter tab holds (with the same search)."""

    all: int
    attention: int
    resolved: int


class ConversationPage(Page[AdminConversation]):
    counts: ConversationCounts


class AdminSource(BaseModel):
    # None if the document has been deleted since; its name is kept
    document_id: int | None
    document_name: str
    similarity: float


class AdminMessage(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime
    # Assistant replies only: "answered" or "no_info"; None for older replies
    outcome: Literal["answered", "no_info"] | None
    # "Answered from": the documents found for this reply, best match first.
    # Documents included in every reply (the contact details) are left out.
    sources: list[AdminSource]


class EarlierConversation(BaseModel):
    id: int
    title: str | None
    last_activity: datetime
    status: Status


class CustomerSummary(BaseModel):
    id: int
    email: str
    joined: datetime
    conversation_count: int
    questions_asked: int
    couldnt_answer: int
    # A few of their other conversations, newest first
    earlier_conversations: list[EarlierConversation]


class AdminConversationDetail(BaseModel):
    conversation: AdminConversation
    resolved_by: int | None
    # Every message, oldest first
    messages: list[AdminMessage]
    customer: CustomerSummary


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
    # The uploader's email (uploads only; None if that account is gone)
    uploaded_by_email: str | None = None


class DocumentCounts(BaseModel):
    """How many documents each source filter holds (with the same search)."""

    all: int
    folder: int
    upload: int


class DocumentPage(Page[AdminDocument]):
    counts: DocumentCounts


class ChunkPreview(BaseModel):
    chunk_index: int
    # The start of the chunk's text (at most PREVIEW_CHARS characters)
    content: str


class AdminDocumentDetail(AdminDocument):
    size_bytes: int | None
    created_at: datetime
    # The first few chunks, shortened
    preview: list[ChunkPreview]
    # Every section (chunk) in full, in order, for the preview panel
    sections: list[ChunkPreview]


class UploadLimits(BaseModel):
    """What the upload form accepts, from the real settings."""

    accepted_types: list[str]
    max_file_bytes: int
    max_pdf_pages: int
    max_chars: int
    max_chunks: int


class UploadedDocument(AdminDocument):
    size_bytes: int
    # Embedding requests this upload used (counts against the daily free quota)
    embedding_requests: int


StatsRange = Literal["today", "7d", "30d"]


class NeedsAttention(BaseModel):
    # Right now, not limited to the range: it is a to-do list
    total: int
    couldnt_answer: int
    unanswered: int


class KnowledgeSummary(BaseModel):
    documents: int
    last_updated: datetime | None


class DayCount(BaseModel):
    day: date
    conversations: int


class AdminStats(BaseModel):
    range: StatsRange
    # Start of the range: midnight in the store's time zone (STORE_TIMEZONE)
    since: datetime
    # Conversations started in the range, and in the same length of time before it
    conversations: int
    previous_conversations: int
    # Customer questions in the range, and replies that answered them
    questions: int
    answered: int
    needs_attention: NeedsAttention
    knowledge: KnowledgeSummary
    customers: int
    # One entry per day of the range, oldest first (days with none included)
    per_day: list[DayCount]
