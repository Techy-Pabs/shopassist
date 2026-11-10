"""Guest chat: guest accounts, their tokens, their limits, and the client IP."""
import threading
import time
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import jwt
import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.cli import users as users_cli
from app.core.config import settings
from app.core.security import JWT_ALGORITHM, create_access_token
from app.main import app
from app.models import Conversation, Message, User
from app.models.user import ROLE_ADMIN
from app.routers import auth
from app.services import guests
from app.services.rate_limit import SlidingWindowLimit

LAGOS = ZoneInfo("Africa/Lagos")


@pytest.fixture
def setting(monkeypatch):
    return lambda name, value: monkeypatch.setattr(settings, name, value)


@pytest.fixture
def guest(client):
    """guest() -> the Bearer header of a new guest."""

    def _guest():
        response = client.post("/auth/guest")
        assert response.status_code == 201, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    return _guest


def start(client, headers) -> int:
    return client.post("/conversations", headers=headers).json()["id"]


def ask(client, headers, cid, text="Is delivery free in Lagos?"):
    return client.post(f"/conversations/{cid}/messages", headers=headers, json={"content": text})


def me(client, headers):
    return client.get("/auth/me", headers=headers).json()


def questions_saved(db) -> int:
    return db.scalar(select(func.count()).select_from(Message).where(Message.role == "user"))


# Guest accounts -------------------------------------------------------------


def test_a_guest_gets_a_token_like_a_login(client):
    response = client.post("/auth/guest")

    assert response.status_code == 201
    assert set(response.json()) == {"access_token", "token_type"}
    assert response.json()["token_type"] == "bearer"


def test_me_says_its_a_guest_with_10_questions_left(client, guest):
    body = me(client, guest())

    assert body["is_guest"] is True
    assert body["email"] is None
    assert body["role"] == "customer"
    assert body["questions_left"] == 10
    assert body["question_limit"] == 10


def test_an_account_isnt_a_guest_and_has_no_question_limit(client, auth_headers):
    body = me(client, auth_headers())

    assert body["is_guest"] is False
    assert (body["questions_left"], body["question_limit"]) == (None, None)


def test_a_guest_is_a_real_user_with_no_email_or_password(client, db):
    client.post("/auth/guest")

    saved = db.scalar(select(User))
    assert (saved.is_guest, saved.email, saved.hashed_password, saved.role) == (True, None, None, "customer")


def test_guest_tokens_last_guest_token_hours(client, setting):
    setting("guest_token_hours", 6)
    token = client.post("/auth/guest").json()["access_token"]

    expires = datetime.fromtimestamp(jwt.decode(token, settings.jwt_secret_key, algorithms=[JWT_ALGORITHM])["exp"], UTC)
    assert timedelta(hours=6) - timedelta(minutes=1) < expires - datetime.now(UTC) <= timedelta(hours=6)


def test_an_expired_guest_token_gets_401(client, db):
    client.post("/auth/guest")
    guest_id = db.scalar(select(User.id))
    expired = create_access_token(guest_id, timedelta(seconds=-1))

    assert client.get("/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_a_guest_chats_like_a_customer(client, guest, fake_ai):
    headers = guest()
    cid = start(client, headers)

    response = ask(client, headers, cid)

    assert response.status_code == 201
    assert response.json()["content"] == fake_ai.reply
    assert len(client.get(f"/conversations/{cid}/messages", headers=headers).json()) == 2
    assert me(client, headers)["questions_left"] == 9


def test_a_guest_cant_see_anyone_elses_conversation(client, guest, auth_headers):
    theirs = start(client, auth_headers())
    headers = guest()

    assert client.get(f"/conversations/{theirs}/messages", headers=headers).status_code == 404
    assert ask(client, headers, theirs).status_code == 404
    assert client.get("/conversations", headers=headers).json() == []


# Every admin endpoint the app has, with every method, found from its routes
ADMIN_ROUTES = sorted(
    (method, route.path)
    for route in app.routes
    if isinstance(route, APIRoute) and route.path.startswith("/admin")
    for method in route.methods
)


def test_the_admin_route_list_is_complete():
    # A guard on the test below: it really does see all of them
    assert len(ADMIN_ROUTES) >= 11
    assert ("DELETE", "/admin/knowledge/documents/{document_id}") in ADMIN_ROUTES
    assert ("POST", "/admin/conversations/{conversation_id}/resolve") in ADMIN_ROUTES


@pytest.mark.parametrize("method, path", ADMIN_ROUTES)
def test_guests_get_403_on_every_admin_endpoint(client, guest, method, path):
    url = path.replace("{conversation_id}", "1").replace("{document_id}", "1")

    response = client.request(method, url, headers=guest())

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin access required"}


# The database's rules (CHECK constraints) ---------------------------------


@pytest.mark.parametrize("fields", [
    {"email": "ada@example.com", "hashed_password": None},
    {"email": None, "hashed_password": "a-hash"},
    {"email": None, "hashed_password": None},
])
def test_an_account_must_have_an_email_and_password(db, fields):
    db.add(User(is_guest=False, **fields))
    with pytest.raises(IntegrityError, match="ck_users_account_has_credentials"):
        db.commit()


@pytest.mark.parametrize("fields", [
    {"email": "ada@example.com"},
    {"hashed_password": "a-hash"},
    {"role": ROLE_ADMIN},
])
def test_a_guest_has_no_email_or_password_and_is_never_an_admin(db, fields):
    db.add(User(is_guest=True, **fields))
    with pytest.raises(IntegrityError, match="ck_users_guest_is_anonymous_customer"):
        db.commit()


def test_the_database_refuses_to_promote_a_guest(client, db):
    client.post("/auth/guest")
    saved = db.scalar(select(User))

    saved.role = ROLE_ADMIN
    with pytest.raises(IntegrityError, match="ck_users_guest_is_anonymous_customer"):
        db.commit()


def test_the_promote_command_refuses_guests(monkeypatch, capsys, client, db, session_factory):
    monkeypatch.setattr(users_cli, "SessionLocal", session_factory)
    client.post("/auth/guest")
    guest_user = db.scalar(select(User))
    # Guests have no email, so the command can't find one; if it ever did, it refuses
    monkeypatch.setattr(users_cli, "find_user", lambda db, email: db.get(User, guest_user.id))
    monkeypatch.setattr("sys.argv", ["users", "promote", "anything@example.com", "--yes"])

    assert users_cli.main() == 1
    assert "Guests can never be admins" in capsys.readouterr().out
    db.expire_all()
    assert db.scalar(select(User.role)) == "customer"


# Guest chat turned off ------------------------------------------------------


@pytest.mark.parametrize("enabled", [True, False])
def test_the_chat_can_ask_whether_guest_chat_is_on(client, db, setting, enabled):
    setting("guest_chat_enabled", enabled)

    response = client.get("/auth/guest")

    assert response.status_code == 200
    assert response.json() == {"enabled": enabled}
    assert db.scalar(select(func.count()).select_from(User)) == 0  # asking creates no guest



def test_with_guest_chat_off_no_guests_are_created(client, db, setting):
    setting("guest_chat_enabled", False)

    response = client.post("/auth/guest")

    assert response.status_code == 403
    assert response.json()["code"] == "guest_chat_disabled"
    assert db.scalar(select(func.count()).select_from(User)) == 0


def test_with_guest_chat_off_existing_guests_cant_send_or_retry(client, guest, setting, fake_ai):
    headers = guest()
    cid = start(client, headers)
    fake_ai.fail = True
    ask(client, headers, cid)  # a 502 leaves a question to retry
    setting("guest_chat_enabled", False)

    assert ask(client, headers, cid).json()["code"] == "guest_chat_disabled"
    assert client.post(f"/conversations/{cid}/retry", headers=headers).json()["code"] == "guest_chat_disabled"


def test_with_guest_chat_off_accounts_still_chat(client, auth_headers, setting):
    setting("guest_chat_enabled", False)
    headers = auth_headers()

    assert ask(client, headers, start(client, headers)).status_code == 201


# The per-guest limit --------------------------------------------------------


def test_the_11th_guest_question_is_refused(client, guest, db, setting, fake_ai):
    setting("guest_messages_per_minute", 100)  # not testing the pace here
    headers = guest()
    cid = start(client, headers)
    for _ in range(10):
        assert ask(client, headers, cid).status_code == 201

    response = ask(client, headers, cid, "One more?")

    assert response.status_code == 429
    assert response.json() == {
        "detail": "You've used your 10 guest questions. Create a free account or sign in to keep chatting.",
        "code": "guest_limit_reached",
    }
    assert "retry-after" not in response.headers  # waiting won't help
    assert questions_saved(db) == 10  # the 11th wasn't saved...
    assert len(fake_ai.calls) == 10  # ...or sent to the AI
    assert me(client, headers)["questions_left"] == 0


def test_the_limit_counts_every_conversation_of_the_guest(client, guest, setting):
    setting("guest_messages_per_minute", 100)
    setting("guest_message_limit", 3)
    headers = guest()
    for _ in range(3):
        ask(client, headers, start(client, headers))

    assert ask(client, headers, start(client, headers)).json()["code"] == "guest_limit_reached"


def test_each_guest_has_their_own_limit(client, guest, setting):
    setting("guest_message_limit", 1)
    first, second = guest(), guest()
    ask(client, first, start(client, first))

    assert ask(client, second, start(client, second)).status_code == 201


def test_accounts_have_no_question_limit(client, auth_headers, setting):
    setting("guest_message_limit", 1)
    headers = auth_headers()
    cid = start(client, headers)

    assert [ask(client, headers, cid).status_code for _ in range(3)] == [201, 201, 201]


def test_retrying_a_failed_reply_isnt_another_question(client, guest, db, setting, fake_ai):
    setting("guest_message_limit", 1)
    headers = guest()
    cid = start(client, headers)
    fake_ai.fail = True
    assert ask(client, headers, cid).status_code == 502  # the question is saved, the reply failed
    assert me(client, headers)["questions_left"] == 0

    fake_ai.fail = False
    retry = client.post(f"/conversations/{cid}/retry", headers=headers)

    # The limit is used up, but the question already asked is still answered
    assert retry.status_code == 201
    assert questions_saved(db) == 1
    assert me(client, headers)["questions_left"] == 0
    # Retry still only answers the latest unanswered question
    assert client.post(f"/conversations/{cid}/retry", headers=headers).status_code == 409


# The daily limit across all guests ---------------------------------------


def test_the_daily_guest_limit_is_shared_by_all_guests(client, guest, setting, freeze):
    freeze(datetime(2026, 10, 20, 22, 0, tzinfo=LAGOS))
    setting("store_timezone", "Africa/Lagos")
    setting("guest_daily_limit", 3)
    first, second, third = guest(), guest(), guest()
    for headers in (first, first, second):
        assert ask(client, headers, start(client, headers)).status_code == 201

    response = ask(client, third, start(client, third))

    assert response.status_code == 429
    assert response.json()["code"] == "guest_daily_limit_reached"
    assert response.json()["detail"].startswith("Guest chat is busy today.")
    # 22:00 in Lagos: two hours until the store's midnight
    assert response.headers["retry-after"] == "7200"


def test_the_daily_limit_doesnt_stop_signed_in_customers(client, guest, auth_headers, setting):
    setting("guest_daily_limit", 1)
    headers = guest()
    ask(client, headers, start(client, headers))
    other = guest()
    assert ask(client, other, start(client, other)).json()["code"] == "guest_daily_limit_reached"

    customer = auth_headers()
    assert ask(client, customer, start(client, customer)).status_code == 201


def test_customer_questions_dont_count_towards_the_daily_guest_limit(client, guest, auth_headers, setting):
    setting("guest_daily_limit", 1)
    customer = auth_headers()
    cid = start(client, customer)
    for _ in range(3):
        ask(client, customer, cid)

    headers = guest()
    assert ask(client, headers, start(client, headers)).status_code == 201


@pytest.fixture
def freeze(monkeypatch):
    """freeze(when): "now" for the guest limits."""
    return lambda when: monkeypatch.setattr(guests, "now", lambda: when.astimezone(settings.store_zone))


@pytest.fixture
def earlier_guest_questions(client, guest, db):
    """earlier_guest_questions(*times): one guest question saved at each time."""

    def _add(*times):
        headers = guest()
        cid = start(client, headers)
        for when in times:
            db.add(Message(conversation_id=cid, role="user", content="Earlier", created_at=when))
        db.commit()

    return _add


def test_questions_from_yesterday_dont_count_today(client, guest, setting, freeze, earlier_guest_questions):
    setting("store_timezone", "Africa/Lagos")
    setting("guest_daily_limit", 1)
    freeze(datetime(2026, 10, 21, 0, 30, tzinfo=LAGOS))
    # 23:50 on the 20th in Lagos: yesterday there
    earlier_guest_questions(datetime(2026, 10, 20, 23, 50, tzinfo=LAGOS))

    headers = guest()
    assert ask(client, headers, start(client, headers)).status_code == 201


@pytest.mark.parametrize("zone, now, expected", [
    # 00:30 on the 21st in Lagos: the earlier question (00:10 Lagos) was today
    ("Africa/Lagos", datetime(2026, 10, 21, 0, 30, tzinfo=LAGOS), 429),
    # 00:30 on the 21st in UTC: the same question (23:10 UTC on the 20th) was yesterday
    ("UTC", datetime(2026, 10, 21, 0, 30, tzinfo=UTC), 201),
])
def test_today_starts_at_midnight_in_the_store_time_zone(client, guest, setting, freeze, earlier_guest_questions,
                                                          zone, now, expected):
    setting("store_timezone", zone)
    setting("guest_daily_limit", 1)
    freeze(now)
    earlier_guest_questions(datetime(2026, 10, 21, 0, 10, tzinfo=LAGOS))

    headers = guest()
    assert ask(client, headers, start(client, headers)).status_code == expected


# The message pace -----------------------------------------------------------


def test_a_guest_can_send_5_messages_a_minute(client, guest):
    headers = guest()
    cid = start(client, headers)
    for _ in range(5):
        assert ask(client, headers, cid).status_code == 201

    response = ask(client, headers, cid)

    assert response.status_code == 429
    assert response.json()["code"] == "guest_too_fast"
    assert 1 <= int(response.headers["retry-after"]) <= 60


def test_the_pace_is_per_minute(client, guest, db):
    headers = guest()
    cid = start(client, headers)
    for _ in range(5):
        ask(client, headers, cid)
    # Move those messages back two minutes
    for message in db.scalars(select(Message)):
        message.created_at = message.created_at - timedelta(minutes=2)
    db.commit()

    assert ask(client, headers, cid).status_code == 201


def test_signed_in_customers_arent_paced(client, auth_headers):
    headers = auth_headers()
    cid = start(client, headers)

    assert all(ask(client, headers, cid).status_code == 201 for _ in range(7))


# Creating guests: per client IP ------------------------------------------


def client_from(address: str) -> TestClient:
    # A client whose connection comes from this address (the test database is
    # already in place through the "client" fixture's override)
    return TestClient(app, client=(address, 50000))


def create(on, **headers):
    return on.post("/auth/guest", headers=headers)


def test_5_guests_an_hour_from_one_address(client):
    assert [create(client).status_code for _ in range(5)] == [201] * 5

    response = create(client)

    assert response.status_code == 429
    assert response.json()["code"] == "guest_create_limit_reached"
    assert 3590 <= int(response.headers["retry-after"]) <= 3600


def test_another_address_has_its_own_count(client):
    for _ in range(5):
        create(client_from("203.0.113.1"))

    assert create(client_from("203.0.113.1")).status_code == 429
    assert create(client_from("203.0.113.2")).status_code == 201


def test_behind_renders_proxy_the_visitor_is_cf_connecting_ip(client):
    render_proxy = client_from("10.21.157.68")
    for _ in range(5):
        create(render_proxy, **{"CF-Connecting-IP": "198.51.100.7"})

    # The same visitor is refused; another visitor through the same proxy isn't
    assert create(render_proxy, **{"CF-Connecting-IP": "198.51.100.7"}).status_code == 429
    assert create(render_proxy, **{"CF-Connecting-IP": "198.51.100.8"}).status_code == 201


def test_a_forged_x_forwarded_for_changes_nothing(client):
    render_proxy = client_from("10.21.157.68")
    for i in range(5):
        create(render_proxy, **{"CF-Connecting-IP": "198.51.100.7", "X-Forwarded-For": f"192.0.2.{i}, 198.51.100.7"})

    # A new made-up address at the front of X-Forwarded-For each time doesn't help
    forged = {"CF-Connecting-IP": "198.51.100.7", "X-Forwarded-For": "192.0.2.99, 198.51.100.7, 172.70.1.1"}
    assert create(render_proxy, **forged).status_code == 429


def test_cf_connecting_ip_is_ignored_unless_the_connection_is_renders_proxy(client):
    # Someone connecting directly (not through Render's proxy) can't pick their address
    direct = client_from("203.0.113.50")
    for i in range(5):
        create(direct, **{"CF-Connecting-IP": f"198.51.100.{i}"})

    assert create(direct, **{"CF-Connecting-IP": "198.51.100.200"}).status_code == 429


def test_without_cf_connecting_ip_the_proxy_address_is_used(client):
    render_proxy = client_from("10.21.157.68")
    for _ in range(5):
        create(render_proxy)

    assert create(render_proxy, **{"CF-Connecting-IP": "not-an-address"}).status_code == 429


def test_guest_creation_limit_follows_the_setting(client, setting):
    setting("guest_create_per_hour", 2)

    assert [create(client).status_code for _ in range(3)] == [201, 201, 429]


def test_no_ip_address_is_saved(client, db):
    create(client_from("203.0.113.77"))

    row = db.execute(select(User.__table__)).mappings().one()
    assert "203.0.113.77" not in str(dict(row))


# The in-memory sliding window ---------------------------------------------


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_the_window_slides():
    clock = Clock()
    limit = SlidingWindowLimit(lambda: 2, window_seconds=60, clock=clock)

    assert limit.hit("a") is None
    clock.now += 20
    assert limit.hit("a") is None
    clock.now += 10
    assert limit.hit("a") == 30  # the first hit leaves the window in 30 seconds
    clock.now += 30
    assert limit.hit("a") is None  # ...and now it has
    assert limit.hit("b") is None  # other keys are separate


def test_refused_hits_dont_count():
    clock = Clock()
    limit = SlidingWindowLimit(lambda: 1, window_seconds=60, clock=clock)
    limit.hit("a")
    for _ in range(5):
        limit.hit("a")

    clock.now += 60
    assert limit.hit("a") is None


def test_old_keys_are_dropped_so_memory_stays_small(monkeypatch):
    from app.services import rate_limit

    monkeypatch.setattr(rate_limit, "_SWEEP_ABOVE", 3)
    clock = Clock()
    limit = SlidingWindowLimit(lambda: 5, window_seconds=60, clock=clock)
    for key in "abcd":
        limit.hit(key)
    clock.now += 61

    limit.hit("e")

    assert set(limit._hits) == {"e"}


def test_two_messages_at_the_same_moment_cant_both_slip_under_the_limit(client, guest, db, setting, monkeypatch):

    setting("guest_message_limit", 1)
    headers = guest()
    cid = start(client, headers)
    # Widen the gap between counting the guest's questions and saving the new
    # one, so without the lock both messages would count 0 and both be saved
    real_count = guests.questions_used

    def slow_count(db, user):
        used = real_count(db, user)
        time.sleep(0.3)
        return used

    monkeypatch.setattr(guests, "questions_used", slow_count)
    barrier = threading.Barrier(2)
    statuses = []

    def send():
        # Each thread has its own client, connection and database session
        with TestClient(app) as own:
            barrier.wait()
            statuses.append(ask(own, headers, cid).status_code)

    threads = [threading.Thread(target=send) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(statuses) == [201, 429]
    assert questions_saved(db) == 1
