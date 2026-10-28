from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, get_user_conversation
from app.models import Conversation, Message, MessageSource, User
from app.schemas.conversation import ConversationCreate, ConversationListItem, ConversationResponse
from app.schemas.message import MessageCreate, MessageResponse
from app.services.ai import AIServiceError, generate_reply
from app.services.outcomes import detect_outcome, sources_for
from app.services.prompts import build_system_prompt
from app.services.retrieval import build_search_text, find_store_information
from app.services.text import shorten

# How many recent messages are sent to the AI as context
HISTORY_LIMIT = 20

# Lengths for titles made from the first message, and for list previews
TITLE_LENGTH = 60
PREVIEW_LENGTH = 80

# Every route in this router requires a logged-in user
router = APIRouter(
    prefix="/conversations",
    tags=["conversations"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
def create_conversation(
    # The body is optional: a plain POST with no body creates an untitled conversation
    body: ConversationCreate | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = Conversation(user_id=current_user.id, title=body.title if body else None)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.get("", response_model=list[ConversationListItem])
def list_conversations(
    limit: int = Query(50, ge=1, le=100, description="How many conversations (at most 100)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The current user's conversations, most recent activity first."""
    # The latest message of each of this user's conversations (DISTINCT ON
    # keeps the first row per conversation in the given order)
    latest = (
        select(Message.conversation_id, Message.content, Message.created_at)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.user_id == current_user.id)
        .distinct(Message.conversation_id)
        .order_by(Message.conversation_id, Message.created_at.desc(), Message.id.desc())
        .subquery()
    )
    updated_at = func.coalesce(latest.c.created_at, Conversation.created_at)
    rows = db.execute(
        select(Conversation, latest.c.content, updated_at.label("updated_at"))
        .outerjoin(latest, latest.c.conversation_id == Conversation.id)
        .where(Conversation.user_id == current_user.id)
        # id breaks ties when two rows have the same time
        .order_by(updated_at.desc(), Conversation.id.desc())
        .limit(limit)
    ).all()
    return [
        ConversationListItem(
            id=c.id, title=c.title, created_at=c.created_at, updated_at=updated,
            last_message_preview=shorten(content, PREVIEW_LENGTH) if content is not None else None,
        )
        for c, content, updated in rows
    ]


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
def list_messages(
    conversation: Conversation = Depends(get_user_conversation),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at, Message.id)
    ).all()


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def send_message(
    body: MessageCreate,
    conversation: Conversation = Depends(get_user_conversation),
    db: Session = Depends(get_db),
):
    db.add(Message(conversation_id=conversation.id, role="user", content=body.content))
    if conversation.resolved_at is not None:
        # The customer wrote again, so it needs attention again
        conversation.resolved_at = None
        conversation.resolved_by = None
    if not conversation.title:
        # An untitled conversation is named after its first message
        conversation.title = shorten(body.content, TITLE_LENGTH)
    db.commit()
    return reply_to_latest_question(conversation, db)


@router.post(
    "/{conversation_id}/retry",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "The latest message already has a reply, or there is none"}},
)
def retry_reply(
    conversation: Conversation = Depends(get_user_conversation),
    db: Session = Depends(get_db),
):
    """Try again to answer the latest customer message, after a reply failed.

    Only the assistant's reply is saved, so the question isn't stored twice.
    """
    latest = db.scalar(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(1)
    )
    if latest is None or latest.role != "user":
        raise HTTPException(status.HTTP_409_CONFLICT, "There is no unanswered question to retry.")
    return reply_to_latest_question(conversation, db)


def reply_to_latest_question(conversation: Conversation, db: Session) -> Message:
    """Generate and save the assistant's reply to the conversation so far.

    Shared by sending and retrying, so both use the same history, store
    information, prompt and failure handling. Raises 502 (saving nothing)
    if the AI can't answer.
    """
    # The newest HISTORY_LIMIT messages, put back into oldest-first order
    recent = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(HISTORY_LIMIT)
    ).all()
    history = [{"role": m.role, "content": m.content} for m in reversed(recent)]

    # Find relevant store information. If the search fails, the reply still
    # goes ahead, with only the always included documents (e.g. contact details).
    search_text = build_search_text([m["content"] for m in history if m["role"] == "user"])
    store_information = find_store_information(db, search_text)

    try:
        reply = generate_reply(build_system_prompt(store_information), history)
    except AIServiceError:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "The assistant is unavailable right now. Please try again in a moment.",
        )

    assistant_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=reply,
        outcome=detect_outcome(reply, store_information),
        sources=[
            MessageSource(document_id=s.document_id, document_name=s.document_name, similarity=s.similarity)
            for s in sources_for(store_information)
        ],
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)
    return assistant_message
