from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    DUMMY_HASH,
    create_access_token,
    hash_password,
    verify_password,
)
from app.dependencies import get_current_user, get_db
from app.models import User
from app.schemas.auth import GuestChatStatus, LoginRequest, RegisterRequest, TokenResponse
from app.schemas.user import MeResponse, UserResponse
from app.services import guests
from app.services.client_ip import client_ip
from app.services.guests import GuestChatError
from app.services.rate_limit import SlidingWindowLimit

router = APIRouter(prefix="/auth", tags=["auth"])

INVALID_CREDENTIALS = "Incorrect email or password"

# Guests each client IP may start per hour, so nobody can create endless
# guests to get around the per-guest limit (the daily cap still applies)
guest_creation_limit = SlidingWindowLimit(lambda: settings.guest_create_per_hour, window_seconds=3600)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")

    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two sign-ups with the same email at the same moment: the unique
        # index in the database catches the second one.
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email))

    if user is None:
        verify_password(body.password, DUMMY_HASH)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_CREDENTIALS)
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_CREDENTIALS)

    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/guest", response_model=GuestChatStatus)
def guest_chat_status():
    """Whether guest chat is on, so the chat button only promises a greeting
    ("1 new message") when one will really be waiting. Creates nothing."""
    return GuestChatStatus(enabled=settings.guest_chat_enabled)


@router.post(
    "/guest",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    responses={403: {"description": "Guest chat is turned off"}, 429: {"description": "Too many guests from this address"}},
)
def create_guest(request: Request, db: Session = Depends(get_db)):
    """Start chatting without an account: creates a guest and returns its token.

    The token lasts GUEST_TOKEN_HOURS and is the only key to the guest's chat.
    """
    guests.ensure_guest_chat_on()
    # The IP is only held in memory, briefly, never saved
    retry_after = guest_creation_limit.hit(client_ip(request))
    if retry_after is not None:
        raise GuestChatError(
            429, "guest_create_limit_reached",
            "Too many guest chats were started from your connection. Please try again later, or sign in.",
            retry_after=retry_after,
        )
    guest = User(is_guest=True)
    db.add(guest)
    db.commit()
    return TokenResponse(access_token=create_access_token(guest.id, timedelta(hours=settings.guest_token_hours)))


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    response = MeResponse.model_validate(current_user)
    if current_user.is_guest:
        response.questions_left = guests.questions_left(db, current_user)
        response.question_limit = settings.guest_message_limit
    return response
