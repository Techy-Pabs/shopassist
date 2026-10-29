"""Endpoints for admins (the store owner and staff): the dashboard's data."""

import logging

from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased

from app.core.config import settings
from app.dependencies import get_db, require_admin
from app.models.user import User as UserModel
from app.models import Chunk, Conversation, Document, Message, MessageSource, User
from app.models.document import SOURCE_FOLDER, SOURCE_UPLOAD
from app.schemas.admin import (
    AdminConversation, AdminConversationDetail, AdminDocument, AdminDocumentDetail, AdminMessage, AdminSource,
    AdminStats, AdminUser, ChunkPreview, ConversationPage, ConversationResolution, CustomerSummary,
    DocumentPage, EarlierConversation, Page, StatsRange, UploadedDocument, UploadLimits,
)
from app.schemas.message import MessageResponse
from app.services import admin_queries as q
from app.services.ai import AIServiceError
from app.services.extraction import ALLOWED_EXTENSIONS, UploadError
from app.services.uploads import process_upload, read_limited

logger = logging.getLogger(__name__)

# Chunks shown in a document's preview, and how much of each
PREVIEW_CHUNKS = 3
PREVIEW_CHARS = 300

# Other conversations shown beside one in the detail view
EARLIER_CONVERSATIONS = 5

# The search box: matched anywhere, case-insensitive, as a bound parameter
Search = Query(None, alias="q", max_length=200, description="Text to search for")

# Every route here requires an admin. require_admin also logs each request.
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


class Pagination:
    """limit (1 to 100, default 20) and offset query parameters.

    A limit over 100 is rejected with 422, so no list is ever unbounded.
    """

    def __init__(
        self,
        limit: int = Query(20, ge=1, le=100, description="Items per page (at most 100)"),
        offset: int = Query(0, ge=0, description="How many items to skip"),
    ):
        self.limit = limit
        self.offset = offset


def count(db: Session, query) -> int:
    return db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))


@router.get("/users", response_model=Page[AdminUser])
def list_users(q_text: str | None = Search, page: Pagination = Depends(), db: Session = Depends(get_db)):
    """Every account (customers and admins), newest first. q searches the email."""
    query = q.user_summaries()
    if q_text:
        query = query.where(User.email.ilike(q.like_pattern(q_text), escape="\\"))
    rows = db.execute(query.limit(page.limit).offset(page.offset)).all()
    items = [AdminUser(**row._mapping) for row in rows]
    return Page(items=items, total=count(db, query), limit=page.limit, offset=page.offset)


def _admin_conversation(row) -> AdminConversation:
    c = row.Conversation
    return AdminConversation(
        id=c.id, title=c.title, user_id=c.user_id, owner_email=row.owner_email,
        message_count=row.message_count, created_at=c.created_at, last_activity=row.last_activity,
        status=row.status, attention_reason=row.attention_reason, resolved_at=c.resolved_at,
    )


@router.get("/conversations", response_model=ConversationPage)
def list_conversations(
    filter: Literal["all", "attention", "resolved"] = Query("all", description="Which tab"),
    q_text: str | None = Search,
    user_id: int | None = Query(None, description="Only this user's conversations"),
    page: Pagination = Depends(),
    db: Session = Depends(get_db),
):
    """Conversations, newest activity first. q searches customer questions and emails."""
    query = q.conversation_summaries()
    if user_id is not None:
        # A filter, not a lookup: an unknown user id simply matches nothing
        query = query.where(Conversation.user_id == user_id)
    if q_text:
        query = q.search_conversations(query, q_text)
    counts = q.conversation_counts(db, query)  # before the tab filter, so every tab has its count
    query = q.filter_conversations(query, filter)
    rows = db.execute(query.limit(page.limit).offset(page.offset)).all()
    return ConversationPage(
        items=[_admin_conversation(row) for row in rows],
        total=count(db, query), limit=page.limit, offset=page.offset, counts=counts,
    )


@router.get("/conversations/{conversation_id}", response_model=AdminConversationDetail)
def get_conversation(conversation_id: int, db: Session = Depends(get_db)):
    """A conversation with every message, its outcome and sources, and its customer."""
    row = db.execute(q.conversation_summaries().where(Conversation.id == conversation_id)).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    conversation = row.Conversation

    messages = db.scalars(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at, Message.id)
    ).all()
    # "Answered from": found documents only (always included ones have no score),
    # all of the conversation's in one query
    sources: dict[int, list[AdminSource]] = {}
    for source in db.scalars(
        select(MessageSource)
        .join(Message, Message.id == MessageSource.message_id)
        .where(Message.conversation_id == conversation_id, MessageSource.similarity.is_not(None))
        .order_by(MessageSource.message_id, MessageSource.similarity.desc(), MessageSource.id)
    ):
        sources.setdefault(source.message_id, []).append(
            AdminSource(document_id=source.document_id, document_name=source.document_name, similarity=source.similarity)
        )

    customer = db.get(User, conversation.user_id)
    earlier = db.execute(
        q.conversation_summaries()
        .where(Conversation.user_id == customer.id, Conversation.id != conversation_id)
        .limit(EARLIER_CONVERSATIONS)
    ).all()
    return AdminConversationDetail(
        conversation=_admin_conversation(row),
        resolved_by=conversation.resolved_by,
        messages=[
            AdminMessage(
                id=m.id, role=m.role, content=m.content, created_at=m.created_at,
                outcome=m.outcome, sources=sources.get(m.id, []),
            )
            for m in messages
        ],
        customer=CustomerSummary(
            id=customer.id, email=customer.email, joined=customer.created_at,
            **q.customer_summary(db, customer.id),
            earlier_conversations=[
                EarlierConversation(
                    id=e.Conversation.id, title=e.Conversation.title, last_activity=e.last_activity, status=e.status,
                )
                for e in earlier
            ],
        ),
    )


@router.get("/conversations/{conversation_id}/messages", response_model=Page[MessageResponse])
def list_conversation_messages(
    conversation_id: int, page: Pagination = Depends(), db: Session = Depends(get_db)
):
    if db.get(Conversation, conversation_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    query = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at, Message.id)
    )
    messages = db.scalars(query.limit(page.limit).offset(page.offset)).all()
    return Page(items=messages, total=count(db, query), limit=page.limit, offset=page.offset)


def _conversation_or_404(db: Session, conversation_id: int) -> Conversation:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation


def _resolution(conversation: Conversation) -> ConversationResolution:
    return ConversationResolution(
        id=conversation.id, resolved_at=conversation.resolved_at, resolved_by=conversation.resolved_by
    )


@router.post("/conversations/{conversation_id}/resolve", response_model=ConversationResolution)
def resolve_conversation(
    conversation_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    """Mark the conversation resolved. Resolving it again keeps the first resolution."""
    conversation = _conversation_or_404(db, conversation_id)
    if conversation.resolved_at is None:
        conversation.resolved_at = func.now()
        conversation.last_resolved_at = conversation.resolved_at
        conversation.resolved_by = admin.id
        db.commit()
        db.refresh(conversation)
    return _resolution(conversation)


@router.post("/conversations/{conversation_id}/reopen", response_model=ConversationResolution)
def reopen_conversation(conversation_id: int, db: Session = Depends(get_db)):
    """Mark the conversation as needing attention again (does nothing if it is open).

    Reopening by hand also forgets the last resolution, so its earlier
    "couldn't answer" replies count again.
    """
    conversation = _conversation_or_404(db, conversation_id)
    if conversation.resolved_at is not None:
        conversation.resolved_at = None
        conversation.resolved_by = None
        conversation.last_resolved_at = None
        db.commit()
        db.refresh(conversation)
    return _resolution(conversation)


@router.get("/knowledge/documents", response_model=DocumentPage)
def list_knowledge_documents(
    source_type: Literal["all", "folder", "upload"] = Query("all", description="Built in (folder) or uploaded"),
    q_text: str | None = Search,
    page: Pagination = Depends(),
    db: Session = Depends(get_db),
):
    """Knowledge documents, by name. q searches the title and file name."""
    uploader = aliased(User)
    models = func.array_remove(func.array_agg(Chunk.embedding_model.distinct()), None)
    query = (
        select(Document, func.count(Chunk.id), models, uploader.email)
        .outerjoin(Chunk, Chunk.document_id == Document.id)
        .outerjoin(uploader, uploader.id == Document.uploaded_by)
        .group_by(Document.id, uploader.email)
        .order_by(Document.source)
    )
    if q_text:
        pattern = q.like_pattern(q_text)
        query = query.where(or_(
            Document.title.ilike(pattern, escape="\\"), Document.source.ilike(pattern, escape="\\"),
        ))
    # Each filter's count, with the same search, in one query
    found = query.order_by(None).subquery()
    folder, upload = db.execute(
        select(
            func.count().filter(found.c.source_type == SOURCE_FOLDER),
            func.count().filter(found.c.source_type == SOURCE_UPLOAD),
        ).select_from(found)
    ).one()
    if source_type != "all":
        query = query.where(Document.source_type == source_type)
    rows = db.execute(query.limit(page.limit).offset(page.offset)).all()
    items = [
        AdminDocument(
            id=d.id, title=d.title, source=d.source, source_type=d.source_type,
            original_filename=d.original_filename, uploaded_by=d.uploaded_by, chunk_count=chunk_count,
            embedding_models=sorted(used_models),
            stale=any(m != settings.embedding_model for m in used_models),
            updated_at=d.updated_at, uploaded_by_email=uploader_email,
        )
        for d, chunk_count, used_models, uploader_email in rows
    ]
    return DocumentPage(
        items=items, total=count(db, query), limit=page.limit, offset=page.offset,
        counts={"all": folder + upload, "folder": folder, "upload": upload},
    )


@router.get("/knowledge/limits", response_model=UploadLimits)
def upload_limits():
    """What the upload form accepts, so the page shows the real limits."""
    return UploadLimits(
        accepted_types=list(ALLOWED_EXTENSIONS), max_file_bytes=settings.upload_max_file_bytes,
        max_pdf_pages=settings.upload_max_pdf_pages, max_chars=settings.upload_max_chars,
        max_chunks=settings.upload_max_chunks,
    )


@router.post(
    "/knowledge/documents",
    response_model=UploadedDocument,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "Duplicate content, or a file name already in use"},
               413: {"description": "Over an upload limit"},
               415: {"description": "Not a real PDF, DOCX, TXT or MD file"},
               422: {"description": "No text could be extracted"},
               502: {"description": "Embedding failed; nothing was saved"}},
)
def upload_knowledge_document(
    file: UploadFile = File(..., description="A .pdf, .docx, .txt or .md file"),
    title: str | None = Form(None, max_length=200, description="Defaults to the file name"),
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Add a document to the knowledge base. Costs one embedding request."""
    try:
        data = read_limited(file.file, settings.upload_max_file_bytes)
        result = process_upload(db, admin, file.filename, data, title)
    except UploadError as error:
        body = {"detail": error.message}
        if hasattr(error, "document_id"):
            body["document_id"] = error.document_id
        return JSONResponse(status_code=error.status_code, content=body)
    except AIServiceError:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "The embedding service is unavailable right now, so the document was not added. "
            "Nothing was saved; please try again later.",
        )
    d = result.document
    return UploadedDocument(
        id=d.id, title=d.title, source=d.source, source_type=d.source_type,
        original_filename=d.original_filename, uploaded_by=d.uploaded_by,
        chunk_count=result.chunk_count, embedding_models=[settings.embedding_model], stale=False,
        updated_at=d.updated_at, size_bytes=d.size_bytes, embedding_requests=result.embedding_requests,
    )


@router.get("/knowledge/documents/{document_id}", response_model=AdminDocumentDetail)
def get_knowledge_document(document_id: int, db: Session = Depends(get_db)):
    """One document, with a short preview of its first chunks."""
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    chunks = db.scalars(
        select(Chunk).where(Chunk.document_id == document_id).order_by(Chunk.chunk_index)
    ).all()
    used_models = sorted({c.embedding_model for c in chunks})
    preview = [
        ChunkPreview(
            chunk_index=c.chunk_index,
            content=c.content if len(c.content) <= PREVIEW_CHARS else c.content[:PREVIEW_CHARS].rstrip() + "...",
        )
        for c in chunks[:PREVIEW_CHUNKS]
    ]
    uploader = db.get(User, document.uploaded_by) if document.uploaded_by else None
    return AdminDocumentDetail(
        id=document.id, title=document.title, source=document.source, source_type=document.source_type,
        original_filename=document.original_filename, uploaded_by=document.uploaded_by,
        chunk_count=len(chunks), embedding_models=used_models,
        stale=any(m != settings.embedding_model for m in used_models),
        updated_at=document.updated_at, size_bytes=document.size_bytes, created_at=document.created_at,
        preview=preview, uploaded_by_email=uploader.email if uploader else None,
        sections=[ChunkPreview(chunk_index=c.chunk_index, content=c.content) for c in chunks],
    )


@router.delete(
    "/knowledge/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={409: {"description": "Folder documents are managed by the knowledge folder"}},
)
def delete_knowledge_document(
    document_id: int, admin: UserModel = Depends(require_admin), db: Session = Depends(get_db)
):
    """Delete an uploaded document and its chunks."""
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    if document.source_type != SOURCE_UPLOAD:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This document comes from the knowledge folder. Remove or change the file in "
            "knowledge/ instead; it can't be deleted here.",
        )
    name = document.source
    db.delete(document)  # its chunks are deleted with it
    db.commit()
    # Ids and the file name only, never the content
    logger.info("Knowledge delete: admin_id=%s document_id=%s file=%s", admin.id, document_id, name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/stats", response_model=AdminStats)
def stats(range: StatsRange = Query("7d", description="today, 7d or 30d"), db: Session = Depends(get_db)):
    """The overview's numbers. Days start at midnight in STORE_TIMEZONE."""
    return AdminStats(**q.stats(db, range))
