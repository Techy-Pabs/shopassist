import math
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.orm import Session

from app.core.config import settings

from app.dependencies import get_current_user, get_db, get_user_conversation
from app.models import Conversation, Message, MessageSource, User
from app.models.message import STATUS_FAILED, STATUS_SENDING, STATUS_SENT
from app.schemas.conversation import ConversationCreate, ConversationListItem, ConversationResponse
from app.schemas.message import MessageCreate, MessageResponse
from app.services import guests
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

def stuck_after() -> timedelta:
    """How long a question can be "sending" before it counts as failed. A
    request makes up to two AI calls (the knowledge search's embedding, then
    the reply), each allowed AI_TIMEOUT_SECONDS, plus 30 seconds for the rest.
    Longer than that, the request has died (a restart, a crash)."""
    return timedelta(seconds=2 * settings.ai_timeout_seconds + 30)


def seconds_until_stuck(messages=Message):
    """SQL: for a question being answered, the seconds until it counts as
    failed (negative once it does). The chat stops waiting then, so it uses
    the server's cut-off rather than a number of its own."""
    return func.extract("epoch", messages.sending_since + stuck_after() - func.now())


def retry_in(seconds: float | None) -> int | None:
    """Whole seconds, at least 1, or None when there's nothing to wait for."""
    return None if seconds is None else max(1, math.ceil(seconds))


def waiting_for_retry(messages=Message):
    """SQL: a question that can be retried. Failed, or left "sending" by a
    request that died."""
    return or_(
        messages.status == STATUS_FAILED,
        and_(messages.status == STATUS_SENDING, messages.sending_since < func.now() - stuck_after()),
    )


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
    def latest_per_conversation(*where):
        # The latest matching message of each of this user's conversations
        # (DISTINCT ON keeps the first row per conversation in the given order)
        return (
            select(
                Message.conversation_id, Message.role, Message.status, Message.sending_since, Message.content,
                Message.created_at,
            )
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(Conversation.user_id == current_user.id, *where)
            .distinct(Message.conversation_id)
            .order_by(Message.conversation_id, Message.created_at.desc(), Message.id.desc())
            .subquery()
        )

    latest = latest_per_conversation()
    # The preview is the latest reply, never the customer's own question
    reply = latest_per_conversation(Message.role == "assistant")
    updated_at = func.coalesce(latest.c.created_at, Conversation.created_at)
    failed = (latest.c.role == "user") & waiting_for_retry(latest.c)
    rows = db.execute(
        select(
            Conversation, reply.c.content, func.coalesce(failed, False), updated_at.label("updated_at"),
            latest.c.content,
        )
        .outerjoin(latest, latest.c.conversation_id == Conversation.id)
        .outerjoin(reply, reply.c.conversation_id == Conversation.id)
        .where(Conversation.user_id == current_user.id)
        # id breaks ties when two rows have the same time
        .order_by(updated_at.desc(), Conversation.id.desc())
        .limit(limit)
    ).all()
    return [
        ConversationListItem(
            id=c.id, title=c.title, created_at=c.created_at, updated_at=updated,
            last_reply_preview=shorten(content, PREVIEW_LENGTH) if content is not None else None,
            last_message_failed=last_failed,
            last_message_preview=shorten(last_content, PREVIEW_LENGTH) if last_content is not None else None,
        )
        for c, content, last_failed, updated, last_content in rows
    ]


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
def list_messages(
    conversation: Conversation = Depends(get_user_conversation),
    db: Session = Depends(get_db),
):
    # A question left "sending" by a request that died shows as failed, so
    # the chat offers Retry
    rows = db.execute(
        select(Message, waiting_for_retry().label("retryable"), seconds_until_stuck().label("seconds_left"))
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at, Message.id)
    ).all()
    return [
        MessageResponse(
            id=m.id, role=m.role, content=m.content, created_at=m.created_at,
            status=STATUS_FAILED if retryable else m.status,
            # Still being answered: how long the chat should wait at most
            retry_in=retry_in(seconds_left) if m.status == STATUS_SENDING and not retryable else None,
        )
        for m, retryable, seconds_left in rows
    ]


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def send_message(
    body: MessageCreate,
    conversation: Conversation = Depends(get_user_conversation),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.is_guest:
        # 403 or 429 before anything is saved; the lock it takes is held
        # until the commit below, so the message counts before anyone else checks
        guests.check_guest_can_send(db, current_user)
    question = Message(
        conversation_id=conversation.id, role="user", content=body.content,
        status=STATUS_SENDING, sending_since=func.now(),
    )
    db.add(question)
    if conversation.resolved_at is not None:
        # The customer wrote again, so it needs attention again
        conversation.resolved_at = None
        conversation.resolved_by = None
    if not conversation.title:
        # An untitled conversation is named after its first message
        conversation.title = shorten(body.content, TITLE_LENGTH)
    db.commit()
    return answer(question, conversation, db)


# What both retry endpoints can answer, besides 201 with the reply
RETRY_RESPONSES = {
    403: {"description": "A guest, while guest chat is turned off (code guest_chat_disabled)"},
    404: {"description": "No such conversation of yours (another user's gets the same 404)"},
    429: {"description": "A guest over a limit: guest_too_fast (retries count towards the per minute pace) or "
                         "guest_daily_limit_reached, with Retry-After. A retry is never counted as a new question."},
    502: {"description": "The AI still couldn't answer: the question stays failed. Body: detail and message_id"},
}


@router.post(
    "/{conversation_id}/messages/{message_id}/retry",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Retry a failed question",
    responses={
        **RETRY_RESPONSES,
        404: {"description": "No such message in a conversation of yours (another user's gets the same 404)"},
        409: {"description": "The message isn't a failed question, or isn't the conversation's latest message, "
                             "or another request is already answering it (code reply_in_progress)"},
    },
)
def retry_message(
    message_id: int,
    conversation: Conversation = Depends(get_user_conversation),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Answer a question whose reply failed (status "failed"), reusing the
    same message: it isn't saved again.

    - **Success:** the question becomes "sent" and the reply is saved and returned.
    - **The AI still can't answer:** 502, and the question stays "failed".
    - **Ownership:** the conversation must be yours and the message in it;
      another user's (or one in another conversation) gets the same 404 as
      one that doesn't exist.
    - **Only the latest question:** an older one gets 409, since its reply
      would land after later messages.
    - **Once at a time:** the question is claimed before the AI is asked.
      A second retry while the first is answering gets 409 with the code
      reply_in_progress. A question left "sending" by a request that died
      can be retried once it has been sending longer than the AI could take.
    - **Guests:** the same limits as sending (per minute, daily, per guest),
      but a retry is never counted as a new question.
    """
    question = db.scalar(select(Message).where(Message.id == message_id, Message.conversation_id == conversation.id))
    if question is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    if question.role != "user" or question.status == STATUS_SENT:
        raise HTTPException(status.HTTP_409_CONFLICT, "This message isn't waiting for a reply.")
    # A reply to an older question would land after later messages
    if latest_message(conversation, db).id != question.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only the latest question can be retried.")
    check_guest_retry(current_user, question, db)
    claim(question, db)
    return answer(question, conversation, db)


@router.post(
    "/{conversation_id}/retry",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Retry the latest question (older form)",
    responses={
        **RETRY_RESPONSES,
        409: {"description": "The latest message already has a reply, or there is none, "
                             "or another request is already answering it (code reply_in_progress)"},
    },
)
def retry_reply(
    conversation: Conversation = Depends(get_user_conversation),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Answer the conversation's latest question if it has no reply yet.

    The older form of retry, kept for clients that use it. The chat uses
    POST /conversations/{id}/messages/{message_id}/retry, and when a send got
    no answer it reloads the conversation to see whether it arrived.

    - **Success:** the question becomes "sent" and the reply is saved and
      returned; the question isn't saved again.
    - **Ownership:** the conversation must be yours; another user's gets the
      same 404 as one that doesn't exist.
    - **Guests:** the same limits as sending (per minute, daily, per guest),
      but a retry is never counted as a new question.
    """
    latest = latest_message(conversation, db)
    if latest is None or latest.role != "user":
        raise HTTPException(status.HTTP_409_CONFLICT, "There is no unanswered question to retry.")
    check_guest_retry(current_user, latest, db)
    claim(latest, db)
    return answer(latest, conversation, db)


class ReplyInProgress(Exception):
    """Another request is already getting this question's reply. Sent as
    409 with the code "reply_in_progress" (see app/main.py), so the chat
    knows the question was saved and doesn't send it again. retry_after: the
    seconds until it counts as failed, sent as Retry-After."""

    message = "This question is already being answered."

    def __init__(self, retry_after: int | None):
        super().__init__(self.message)
        self.retry_after = retry_after


def claim(question: Message, db: Session) -> None:
    """Take the question for this request, or raise ReplyInProgress.

    One UPDATE that only matches while the question can be retried (failed,
    or left sending by a request that died) marks it "sending". Two retries
    at the same moment can't both match: the database lets one change the
    row, and by the time the other's UPDATE runs the row is "sending" and no
    longer matches. Only the request that changed a row asks the AI."""
    claimed = db.execute(
        update(Message)
        .where(Message.id == question.id, Message.role == "user", waiting_for_retry())
        .values(status=STATUS_SENDING, sending_since=func.now())
        .execution_options(synchronize_session=False)
    ).rowcount
    db.commit()
    if claimed != 1:
        seconds = db.scalar(
            select(seconds_until_stuck()).where(Message.id == question.id, Message.status == STATUS_SENDING)
        )
        raise ReplyInProgress(retry_in(seconds))
    db.refresh(question)


def check_guest_retry(user: User, question: Message, db: Session) -> None:
    """For a guest, the same limits as sending (403 or 429), without counting
    the question again. Commits straight away, so the lock the check takes
    isn't held while the AI answers."""
    if user.is_guest:
        guests.check_guest_can_send(db, user, retrying=question)
        db.commit()


class ReplyFailed(Exception):
    """The AI couldn't answer. Sent as 502 with the failed question's id, so
    the chat can retry that same message (see app/main.py)."""

    message = "The assistant is unavailable right now. Please try again in a moment."

    def __init__(self, message_id: int):
        super().__init__(self.message)
        self.message_id = message_id


def latest_message(conversation: Conversation, db: Session) -> Message | None:
    return db.scalar(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(1)
    )


def answer(question: Message, conversation: Conversation, db: Session) -> Message:
    """Generate and save the assistant's reply to the conversation so far,
    whose latest message is question.

    Shared by sending and retrying, so both use the same history, store
    information, prompt and failure handling. On success the question is
    "sent" and the reply saved; if the AI can't answer, the question is
    "failed", no reply is saved, and ReplyFailed is raised.
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
        question.status = STATUS_FAILED
        question.sending_since = None
        db.commit()
        raise ReplyFailed(question.id)

    question.status = STATUS_SENT
    question.sending_since = None

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
