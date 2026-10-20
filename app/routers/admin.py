"""Read only endpoints for admins (the store owner and staff)."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.dependencies import get_db, require_admin
from app.models.user import User as UserModel
from app.models import Chunk, Conversation, Document, Message, User
from app.schemas.admin import AdminConversation, AdminDocument, AdminStats, AdminUser, Page, UploadedDocument
from app.schemas.message import MessageResponse
from app.services.ai import AIServiceError
from app.services.extraction import UploadError
from app.services.uploads import process_upload, read_limited

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
def list_users(page: Pagination = Depends(), db: Session = Depends(get_db)):
    query = select(User).order_by(User.created_at.desc(), User.id.desc())
    users = db.scalars(query.limit(page.limit).offset(page.offset)).all()
    return Page(items=users, total=count(db, query), limit=page.limit, offset=page.offset)


@router.get("/conversations", response_model=Page[AdminConversation])
def list_conversations(
    user_id: int | None = Query(None, description="Only this user's conversations"),
    page: Pagination = Depends(),
    db: Session = Depends(get_db),
):
    query = (
        select(Conversation, User.email, func.count(Message.id))
        .join(User, Conversation.user_id == User.id)
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .group_by(Conversation.id, User.email)
        .order_by(Conversation.created_at.desc(), Conversation.id.desc())
    )
    if user_id is not None:
        # A filter, not a lookup: an unknown user id simply matches nothing
        query = query.where(Conversation.user_id == user_id)
    rows = db.execute(query.limit(page.limit).offset(page.offset)).all()
    items = [
        AdminConversation(
            id=c.id, title=c.title, user_id=c.user_id, owner_email=email,
            message_count=message_count, created_at=c.created_at,
        )
        for c, email, message_count in rows
    ]
    return Page(items=items, total=count(db, query), limit=page.limit, offset=page.offset)


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


@router.get("/knowledge/documents", response_model=Page[AdminDocument])
def list_knowledge_documents(page: Pagination = Depends(), db: Session = Depends(get_db)):
    models = func.array_remove(func.array_agg(Chunk.embedding_model.distinct()), None)
    query = (
        select(Document, func.count(Chunk.id), models)
        .outerjoin(Chunk, Chunk.document_id == Document.id)
        .group_by(Document.id)
        .order_by(Document.source)
    )
    rows = db.execute(query.limit(page.limit).offset(page.offset)).all()
    items = [
        AdminDocument(
            id=d.id, title=d.title, source=d.source, source_type=d.source_type,
            original_filename=d.original_filename, uploaded_by=d.uploaded_by, chunk_count=chunk_count,
            embedding_models=sorted(used_models),
            stale=any(m != settings.embedding_model for m in used_models),
            updated_at=d.updated_at,
        )
        for d, chunk_count, used_models in rows
    ]
    return Page(items=items, total=count(db, query), limit=page.limit, offset=page.offset)


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


@router.get("/stats", response_model=AdminStats)
def stats(db: Session = Depends(get_db)):
    def total(model) -> int:
        return db.scalar(select(func.count()).select_from(model))

    return AdminStats(
        users=total(User), conversations=total(Conversation), messages=total(Message),
        documents=total(Document), chunks=total(Chunk),
    )
