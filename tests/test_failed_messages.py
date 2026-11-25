"""Questions whose reply failed: the "failed" status, retrying the same
message, the history preview, and the migration that adds the status."""
from datetime import UTC, datetime, timedelta

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.models import Message, User
from app.models.message import STATUS_FAILED, STATUS_SENT
from tests.conftest import DEV_DATABASE_URL, TEST_DATABASE_URL


def start(client, headers) -> int:
    return client.post("/conversations", headers=headers).json()["id"]


def ask(client, headers, cid, content="Is pickup free in Lekki?"):
    return client.post(f"/conversations/{cid}/messages", headers=headers, json={"content": content})


def retry(client, headers, cid, message_id):
    return client.post(f"/conversations/{cid}/messages/{message_id}/retry", headers=headers)


def messages(db, cid=None) -> list[tuple[str, str, str]]:
    db.expire_all()
    query = select(Message.role, Message.content, Message.status).order_by(Message.created_at, Message.id)
    if cid is not None:
        query = query.where(Message.conversation_id == cid)
    return [tuple(row) for row in db.execute(query)]


@pytest.fixture
def failed(client, auth_headers, fake_ai):
    """A conversation whose latest question's reply failed: (headers, cid, message_id)."""
    headers = auth_headers()
    cid = start(client, headers)
    fake_ai.fail = True
    response = ask(client, headers, cid)
    assert response.status_code == 502
    fake_ai.fail = False
    return headers, cid, response.json()["message_id"]


# The failed status --------------------------------------------------------------


def test_a_failed_reply_keeps_the_question_as_failed_and_saves_no_reply(client, auth_headers, db, fake_ai):
    headers = auth_headers()
    cid = start(client, headers)
    fake_ai.fail = True

    response = ask(client, headers, cid)

    assert response.status_code == 502
    body = response.json()
    assert body["detail"] == "The assistant is unavailable right now. Please try again in a moment."
    assert messages(db) == [("user", "Is pickup free in Lekki?", STATUS_FAILED)]
    assert body["message_id"] == db.scalar(select(Message.id))


def test_an_answered_question_is_sent(client, auth_headers, db, fake_ai):
    headers = auth_headers()
    cid = start(client, headers)

    reply = ask(client, headers, cid)

    assert reply.status_code == 201
    assert reply.json()["status"] == STATUS_SENT
    assert messages(db) == [("user", "Is pickup free in Lekki?", STATUS_SENT), ("assistant", fake_ai.reply, STATUS_SENT)]


def test_the_messages_list_shows_the_failed_state(client, failed):
    headers, cid, message_id = failed

    listed = client.get(f"/conversations/{cid}/messages", headers=headers).json()

    assert [(m["id"], m["role"], m["status"]) for m in listed] == [(message_id, "user", STATUS_FAILED)]


def test_only_a_question_can_be_failed(db, client, auth_headers):
    headers = auth_headers()
    cid = start(client, headers)
    db.add(Message(conversation_id=cid, role="assistant", content="A reply", status=STATUS_FAILED))
    with pytest.raises(IntegrityError, match="ck_messages_unsent_only_for_questions"):
        db.commit()


def test_status_is_sent_sending_or_failed(db, client, auth_headers):
    headers = auth_headers()
    cid = start(client, headers)
    db.add(Message(conversation_id=cid, role="user", content="Hello", status="pending"))
    with pytest.raises(IntegrityError, match="ck_messages_status_valid"):
        db.commit()


# Retrying the same message ------------------------------------------------------


def test_retry_answers_the_same_message_without_saving_it_again(client, db, failed, fake_ai):
    headers, cid, message_id = failed

    response = retry(client, headers, cid, message_id)

    assert response.status_code == 201
    assert response.json()["role"] == "assistant"
    assert response.json()["content"] == fake_ai.reply
    # One question (the same row, now sent) and its reply: no duplicate
    assert messages(db) == [("user", "Is pickup free in Lekki?", STATUS_SENT), ("assistant", fake_ai.reply, STATUS_SENT)]
    assert db.scalar(select(Message.id).where(Message.role == "user")) == message_id


def test_a_retry_that_fails_again_keeps_one_failed_question(client, db, failed, fake_ai):
    headers, cid, message_id = failed
    fake_ai.fail = True

    first = retry(client, headers, cid, message_id)
    second = retry(client, headers, cid, message_id)

    assert (first.status_code, second.status_code) == (502, 502)
    assert first.json()["message_id"] == second.json()["message_id"] == message_id
    assert messages(db) == [("user", "Is pickup free in Lekki?", STATUS_FAILED)]


def test_the_retried_reply_sees_the_question_once(client, failed, fake_ai):
    headers, cid, message_id = failed

    retry(client, headers, cid, message_id)

    assert [m["content"] for m in fake_ai.calls[-1]["history"]] == ["Is pickup free in Lekki?"]


def test_another_users_message_gets_404(client, failed, auth_headers, db):
    _, cid, message_id = failed
    someone_else = auth_headers("mallory@example.com")
    their_cid = start(client, someone_else)

    # Their conversation in the address, or ours: the same 404 as a message that doesn't exist
    assert retry(client, someone_else, cid, message_id).status_code == 404
    assert retry(client, someone_else, their_cid, message_id).status_code == 404
    assert retry(client, someone_else, their_cid, 999_999).status_code == 404
    assert messages(db) == [("user", "Is pickup free in Lekki?", STATUS_FAILED)]


def test_a_guest_cant_retry_someone_elses_message(client, failed, db):
    _, cid, message_id = failed
    guest = {"Authorization": f"Bearer {client.post('/auth/guest').json()['access_token']}"}

    assert retry(client, guest, cid, message_id).status_code == 404
    assert retry(client, guest, start(client, guest), message_id).status_code == 404


def test_a_message_from_another_of_your_conversations_gets_404(client, failed):
    headers, _, message_id = failed
    other = start(client, headers)

    assert retry(client, headers, other, message_id).status_code == 404


def test_a_sent_question_or_a_reply_cant_be_retried(client, auth_headers, db):
    headers = auth_headers()
    cid = start(client, headers)
    ask(client, headers, cid)
    question, reply = db.scalars(select(Message.id).order_by(Message.id)).all()

    for message_id in (question, reply):
        response = retry(client, headers, cid, message_id)
        assert response.status_code == 409
        assert response.json()["detail"] == "This message isn't waiting for a reply."


def test_only_the_latest_question_can_be_retried(client, failed, db):
    headers, cid, message_id = failed
    ask(client, headers, cid, "And delivery to Abuja?")  # answered, after the failed one

    response = retry(client, headers, cid, message_id)

    assert response.status_code == 409
    assert response.json()["detail"] == "Only the latest question can be retried."


def test_a_guest_retries_without_using_a_question(client, db, fake_ai, monkeypatch):
    monkeypatch.setattr(settings, "guest_message_limit", 1)
    guest = {"Authorization": f"Bearer {client.post('/auth/guest').json()['access_token']}"}
    cid = start(client, guest)
    fake_ai.fail = True
    message_id = ask(client, guest, cid).json()["message_id"]
    fake_ai.fail = False

    assert retry(client, guest, cid, message_id).status_code == 201
    assert client.get("/auth/me", headers=guest).json()["questions_left"] == 0  # the one question, not two
    assert len(messages(db, cid)) == 2


def test_the_older_retry_also_marks_the_question(client, db, failed):
    headers, cid, _ = failed

    assert client.post(f"/conversations/{cid}/retry", headers=headers).status_code == 201
    assert [status for _, _, status in messages(db)] == [STATUS_SENT, STATUS_SENT]


# The history preview ------------------------------------------------------------


def listing(client, headers):
    return {item["id"]: item for item in client.get("/conversations", headers=headers).json()}


def test_the_preview_is_the_last_reply_never_the_question(client, auth_headers, fake_ai):
    headers = auth_headers()
    cid = start(client, headers)
    fake_ai.reply = "Pickup in Lekki is free."
    ask(client, headers, cid)

    item = listing(client, headers)[cid]

    assert (item["last_reply_preview"], item["last_message_failed"]) == ("Pickup in Lekki is free.", False)


def test_when_the_last_question_failed_the_preview_says_so(client, failed):
    headers, cid, _ = failed

    item = listing(client, headers)[cid]

    # No reply to show: the chat shows "Waiting for a reply"
    assert (item["last_reply_preview"], item["last_message_failed"]) == (None, True)


def test_a_failed_follow_up_keeps_the_earlier_reply_as_the_preview(client, auth_headers, fake_ai):
    headers = auth_headers()
    cid = start(client, headers)
    fake_ai.reply = "Pickup in Lekki is free."
    ask(client, headers, cid)
    fake_ai.fail = True
    ask(client, headers, cid, "And in Abuja?")

    item = listing(client, headers)[cid]

    assert (item["last_reply_preview"], item["last_message_failed"]) == ("Pickup in Lekki is free.", True)


def test_after_a_successful_retry_it_is_no_longer_waiting(client, failed, fake_ai):
    headers, cid, message_id = failed
    fake_ai.reply = "Pickup in Lekki is free."
    retry(client, headers, cid, message_id)

    item = listing(client, headers)[cid]

    assert (item["last_reply_preview"], item["last_message_failed"]) == ("Pickup in Lekki is free.", False)


# The migration ------------------------------------------------------------------

BEFORE = "abda875055b6"  # the migration before the status column

# The read-only count to run on a database before migrating (see the README):
# it uses only columns that exist before the migration
WOULD_BE_FAILED = """
    SELECT count(*) FROM messages m
    WHERE m.role = 'user'
      AND m.created_at < now() - interval '5 minutes'
      AND NOT EXISTS (
          SELECT 1 FROM messages later
          WHERE later.conversation_id = m.conversation_id
            AND (later.created_at, later.id) > (m.created_at, m.id)
      )
"""


@pytest.fixture
def migration_db(monkeypatch):
    """An empty database of its own, migrated by Alembic (not create_all)."""
    url = DEV_DATABASE_URL.set(database=f"{DEV_DATABASE_URL.database}_migration")
    assert url.database not in (DEV_DATABASE_URL.database, TEST_DATABASE_URL.database)
    admin = create_engine(DEV_DATABASE_URL.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)'))
        conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    # env.py reads the URL from the settings
    monkeypatch.setattr(settings, "database_url", url.render_as_string(hide_password=False))
    # No ini file: Alembic's logging setup would change the app's loggers for other tests
    config = Config()
    config.set_main_option("script_location", "alembic")
    engine = create_engine(url)
    yield config, engine
    engine.dispose()
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)'))
    admin.dispose()


def test_the_migration_adds_the_status_and_marks_earlier_failed_replies(migration_db):
    config, engine = migration_db
    command.upgrade(config, BEFORE)
    with engine.connect() as conn:
        checks_before = constraint_names(conn)
        columns_before = column_names(conn)
    long_ago = datetime.now(UTC) - timedelta(days=2)
    with engine.begin() as conn:
        user = conn.execute(text("INSERT INTO users (email, hashed_password) VALUES ('ada@example.com', 'h') RETURNING id")).scalar()

        def conversation(*rows, when=long_ago):
            cid = conn.execute(text("INSERT INTO conversations (user_id) VALUES (:u) RETURNING id"), {"u": user}).scalar()
            for i, (role, content) in enumerate(rows):
                conn.execute(
                    text("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (:c, :r, :t, :w)"),
                    {"c": cid, "r": role, "t": content, "w": when + timedelta(seconds=i)},
                )
        # Answered; a reply that failed long ago; and a question asked just now
        conversation(("user", "Answered?"), ("assistant", "Yes."))
        conversation(("user", "Asked first"), ("assistant", "Yes."), ("user", "Its reply failed"))
        conversation(("user", "Its reply may be on its way"), when=datetime.now(UTC))

    with engine.connect() as conn:
        predicted = conn.execute(text(WOULD_BE_FAILED)).scalar()

    command.upgrade(config, "head")

    with engine.connect() as conn:
        rows = conn.execute(text("SELECT content, status FROM messages ORDER BY id")).all()
        checks = constraint_names(conn)
    assert [tuple(r) for r in rows] == [
        ("Answered?", "sent"), ("Yes.", "sent"),
        ("Asked first", "sent"), ("Yes.", "sent"), ("Its reply failed", "failed"),
        ("Its reply may be on its way", "sent"),  # too recent to tell
    ]
    assert {
        "ck_messages_status_valid", "ck_messages_unsent_only_for_questions", "ck_messages_sending_since_while_sending",
    } <= set(checks)
    # The read-only count before migrating predicts exactly what it marks
    assert predicted == sum(1 for _, status in rows if status == "failed") == 1

    # The checks apply to what's saved from now on
    with pytest.raises(IntegrityError, match="ck_messages_unsent_only_for_questions"):
        with engine.begin() as conn:
            conn.execute(text("UPDATE messages SET status = 'failed' WHERE role = 'assistant'"))
    with pytest.raises(IntegrityError, match="ck_messages_sending_since_while_sending"):
        with engine.begin() as conn:
            conn.execute(text("UPDATE messages SET status = 'sending' WHERE content = 'Its reply failed'"))

    # And it can be undone cleanly: all three checks and both columns go, and
    # the table is exactly as it was
    command.downgrade(config, BEFORE)
    with engine.connect() as conn:
        assert constraint_names(conn) == checks_before
        assert column_names(conn) == columns_before
    assert {"status", "sending_since"}.isdisjoint(columns_before)
    assert not any(name in checks_before for name in (
        "ck_messages_status_valid", "ck_messages_unsent_only_for_questions", "ck_messages_sending_since_while_sending",
    ))
    # ...and it upgrades again
    command.upgrade(config, "head")


def constraint_names(conn) -> list[str]:
    return conn.execute(text(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'messages'::regclass AND contype = 'c' ORDER BY conname"
    )).scalars().all()


def column_names(conn) -> list[str]:
    return conn.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'messages' ORDER BY column_name"
    )).scalars().all()


# Guest limits on retries ---------------------------------------------------------
# Both retry endpoints apply the same three limits as sending, without counting
# the retried question again.

def new_guest(client):
    return {"Authorization": f"Bearer {client.post('/auth/guest').json()['access_token']}"}


@pytest.fixture(params=["by id", "older form"])
def retry_any(request, client):
    """retry_any(headers, cid, message_id): the new endpoint, or the older /retry."""

    def _retry(headers, cid, message_id):
        if request.param == "by id":
            return retry(client, headers, cid, message_id)
        return client.post(f"/conversations/{cid}/retry", headers=headers)

    return _retry


@pytest.fixture
def guest_failed(client, fake_ai):
    """guest_failed(headers=None) -> (headers, cid, message_id) of a guest question whose reply failed."""

    def _make(headers=None):
        headers = headers or new_guest(client)
        cid = start(client, headers)
        fake_ai.fail = True
        message_id = ask(client, headers, cid).json()["message_id"]
        fake_ai.fail = False
        return headers, cid, message_id

    return _make


def test_retrying_the_last_allowed_question_is_allowed_and_uses_nothing(client, guest_failed, retry_any, monkeypatch):
    monkeypatch.setattr(settings, "guest_message_limit", 1)
    headers, cid, message_id = guest_failed()
    assert client.get("/auth/me", headers=headers).json()["questions_left"] == 0

    assert retry_any(headers, cid, message_id).status_code == 201
    assert client.get("/auth/me", headers=headers).json()["questions_left"] == 0


def test_the_per_guest_limit_still_applies_to_a_retry(client, guest_failed, retry_any, monkeypatch):
    headers, cid, message_id = guest_failed()
    ask(client, headers, start(client, headers))  # a second question, answered
    headers, cid, message_id = guest_failed(headers)  # a third, which failed
    # The limit is lowered: two questions besides the one being retried
    monkeypatch.setattr(settings, "guest_message_limit", 2)

    response = retry_any(headers, cid, message_id)

    assert response.status_code == 429
    assert response.json()["code"] == "guest_limit_reached"


def test_a_retry_is_refused_once_other_guests_have_used_up_the_day(client, guest_failed, retry_any, monkeypatch, db):
    monkeypatch.setattr(settings, "guest_daily_limit", 2)
    headers, cid, message_id = guest_failed()
    other = new_guest(client)
    ask(client, other, start(client, other))  # the day's second guest question

    response = retry_any(headers, cid, message_id)

    assert response.status_code == 429
    assert response.json()["code"] == "guest_daily_limit_reached"
    assert int(response.headers["retry-after"]) > 0
    assert messages(db, cid) == [("user", "Is pickup free in Lekki?", STATUS_FAILED)]


def test_once_the_day_is_used_up_even_its_last_question_waits(client, guest_failed, retry_any, monkeypatch):
    # The daily limit is the day's shared AI budget: when it's used up, a
    # retry would be one more AI request, so it waits until tomorrow
    monkeypatch.setattr(settings, "guest_daily_limit", 1)
    headers, cid, message_id = guest_failed()  # the day's only allowed question

    response = retry_any(headers, cid, message_id)

    assert response.json()["code"] == "guest_daily_limit_reached"


def test_with_room_left_today_a_retry_uses_none_of_it(client, guest_failed, retry_any, monkeypatch):
    monkeypatch.setattr(settings, "guest_daily_limit", 2)
    headers, cid, message_id = guest_failed()

    assert retry_any(headers, cid, message_id).status_code == 201
    other = new_guest(client)
    assert ask(client, other, start(client, other)).status_code == 201  # the day's 2nd question still fits


def test_retries_count_towards_the_per_minute_pace(client, guest_failed, retry_any, fake_ai, monkeypatch):
    monkeypatch.setattr(settings, "guest_messages_per_minute", 3)
    headers, cid, message_id = guest_failed()  # 1 send
    fake_ai.fail = True
    assert retry_any(headers, cid, message_id).status_code == 502  # 2: a retry
    assert retry_any(headers, cid, message_id).status_code == 502  # 3

    response = retry_any(headers, cid, message_id)  # a 4th AI request in the minute

    assert response.status_code == 429
    assert response.json()["code"] == "guest_too_fast"
    assert 1 <= int(response.headers["retry-after"]) <= 60
    assert len(fake_ai.calls) == 3  # the refused retry never reached the AI


def test_sends_and_retries_share_the_pace(client, guest_failed, retry_any, fake_ai, monkeypatch):
    monkeypatch.setattr(settings, "guest_messages_per_minute", 2)
    headers, cid, message_id = guest_failed()  # a send
    fake_ai.fail = True
    retry_any(headers, cid, message_id)  # and a retry

    assert ask(client, headers, start(client, headers)).json()["code"] == "guest_too_fast"


def test_retries_leave_the_pace_after_a_minute(client, guest_failed, retry_any, fake_ai, monkeypatch, db):
    from app.services import guests

    monkeypatch.setattr(settings, "guest_messages_per_minute", 2)
    headers, cid, message_id = guest_failed()
    fake_ai.fail = True
    retry_any(headers, cid, message_id)
    # A minute later: the send's time moves back, and the retry is forgotten
    for message in db.scalars(select(Message)):
        message.created_at -= timedelta(minutes=2)
    db.commit()
    guests.guest_retries.reset()
    fake_ai.fail = False

    assert retry_any(headers, cid, message_id).status_code == 201


def test_a_guest_cant_retry_with_guest_chat_off(client, guest_failed, retry_any, monkeypatch):
    headers, cid, message_id = guest_failed()
    monkeypatch.setattr(settings, "guest_chat_enabled", False)

    response = retry_any(headers, cid, message_id)

    assert response.status_code == 403
    assert response.json()["code"] == "guest_chat_disabled"


def test_accounts_retry_without_guest_limits(client, failed, retry_any, fake_ai, monkeypatch):
    headers, cid, message_id = failed
    monkeypatch.setattr(settings, "guest_messages_per_minute", 1)
    fake_ai.fail = True

    assert [retry_any(headers, cid, message_id).status_code for _ in range(4)] == [502] * 4


# The deprecated preview ---------------------------------------------------------


def test_the_old_preview_field_is_kept_as_before_for_the_deployed_chat(client, auth_headers, fake_ai):
    headers = auth_headers()
    cid = start(client, headers)
    fake_ai.reply = "Pickup in Lekki is free."
    ask(client, headers, cid)
    fake_ai.fail = True
    ask(client, headers, cid, "And in Abuja?")

    item = listing(client, headers)[cid]

    # The latest message, whoever wrote it (here the failed question), as it always was
    assert item["last_message_preview"] == "And in Abuja?"
    assert (item["last_reply_preview"], item["last_message_failed"]) == ("Pickup in Lekki is free.", True)


def test_the_old_preview_field_is_marked_deprecated_in_the_api_docs(client):
    fields = client.get("/openapi.json").json()["components"]["schemas"]["ConversationListItem"]["properties"]

    assert fields["last_message_preview"]["deprecated"] is True
    assert "deprecated" not in fields["last_reply_preview"]


# The admin's numbers ------------------------------------------------------------


def test_a_failed_question_counts_for_the_admin_as_it_did_before_the_status(client, auth_headers, db, fake_ai):
    from sqlalchemy import update

    from app.models.user import ROLE_ADMIN

    customer = auth_headers()
    ask(client, customer, start(client, customer))  # answered
    fake_ai.fail = True
    ask(client, customer, start(client, customer), "And in Abuja?")  # its reply failed
    admin = auth_headers("admin@example.com")
    db.execute(update(User).where(User.email == "admin@example.com").values(role=ROLE_ADMIN))
    db.commit()

    stats = client.get("/admin/stats?range=today", headers=admin).json()
    listed = client.get("/admin/conversations", headers=admin).json()["items"]

    # Two customer questions, one answered; the failed one is unanswered,
    # exactly as a question with no reply was before the status existed
    assert (stats["questions"], stats["answered"]) == (2, 1)
    assert stats["needs_attention"] == {"total": 1, "unanswered": 1, "couldnt_answer": 0}
    assert sorted((i["title"], i["attention_reason"]) for i in listed) == [
        ("And in Abuja?", "unanswered"), ("Is pickup free in Lekki?", None),
    ]


# The older retry: ownership, and both in the API docs ---------------------------


def test_the_older_retry_checks_ownership(client, failed, auth_headers, db):
    _, cid, _ = failed
    someone_else = auth_headers("mallory@example.com")
    guest = new_guest(client)

    for headers in (someone_else, guest):
        response = client.post(f"/conversations/{cid}/retry", headers=headers)
        assert response.status_code == 404
        assert response.json() == {"detail": "Conversation not found"}
    assert messages(db) == [("user", "Is pickup free in Lekki?", STATUS_FAILED)]


@pytest.mark.parametrize("path", [
    "/conversations/{conversation_id}/messages/{message_id}/retry",
    "/conversations/{conversation_id}/retry",
])
def test_both_retries_are_described_in_the_api_docs(client, path):
    operation = client.get("/openapi.json").json()["paths"][path]["post"]

    assert operation["summary"].startswith("Retry")
    assert "Ownership" in operation["description"] and "Guests" in operation["description"]
    assert {"201", "403", "404", "409", "429", "502"} <= set(operation["responses"])
    assert "never counted as a new question" in operation["responses"]["429"]["description"]


# Two retries of the same message at the same moment -----------------------------


def retry_twice_at_once(cid, message_id, headers, path, monkeypatch, fake_ai):
    """Two retries of one failed question, sent at the same moment (a double
    tap, two tabs), while the AI takes a moment to answer. Returns their
    status codes, sorted."""
    import threading
    import time

    from fastapi.testclient import TestClient

    from app.main import app
    from app.routers import conversations

    def slow_ai(system_prompt, history):
        time.sleep(0.5)  # both retries are in flight together
        return fake_ai(system_prompt, history)

    monkeypatch.setattr(conversations, "generate_reply", slow_ai)
    barrier = threading.Barrier(2)
    statuses = []

    def send():
        with TestClient(app) as own:  # its own connection and database session
            barrier.wait()
            statuses.append(own.post(path.format(cid=cid, mid=message_id), headers=headers).status_code)

    threads = [threading.Thread(target=send) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return sorted(statuses)


@pytest.mark.parametrize("path", [
    "/conversations/{cid}/messages/{mid}/retry",
    "/conversations/{cid}/retry",
])
def test_two_retries_at_once_answer_the_question_once(client, db, failed, fake_ai, monkeypatch, path):
    headers, cid, message_id = failed
    calls_before = len(fake_ai.calls)

    statuses = retry_twice_at_once(cid, message_id, headers, path, monkeypatch, fake_ai)

    # One retry answers; the other is told the question is already being answered
    assert statuses == [201, 409]
    assert len(fake_ai.calls) - calls_before == 1  # the AI was asked once
    assert messages(db) == [("user", "Is pickup free in Lekki?", STATUS_SENT), ("assistant", fake_ai.reply, STATUS_SENT)]



# Claiming the question, and "sending" -------------------------------------------


def set_sending(db, message_id, ago):
    """Put a question back to "sending", as if a request started ago and is
    still going (or died)."""
    message = db.get(Message, message_id)
    message.status, message.sending_since = "sending", datetime.now(UTC) - ago
    db.commit()


def test_a_new_question_is_sending_while_its_reply_is_written(client, auth_headers, db, monkeypatch, fake_ai):
    from app.routers import conversations

    seen = []

    def watching_ai(system_prompt, history):
        db.expire_all()
        seen.append(db.execute(select(Message.status, Message.sending_since)).one())
        return fake_ai(system_prompt, history)

    monkeypatch.setattr(conversations, "generate_reply", watching_ai)
    headers = auth_headers()
    ask(client, headers, start(client, headers))

    [(status, since)] = seen
    assert status == "sending" and since is not None
    # Afterwards: sent, and no longer sending since anything
    db.expire_all()
    assert db.execute(select(Message.status, Message.sending_since).where(Message.role == "user")).one() == ("sent", None)


def test_a_retry_while_another_is_answering_gets_409_reply_in_progress(client, db, failed, retry_any):
    headers, cid, message_id = failed
    set_sending(db, message_id, ago=timedelta(seconds=5))  # another request is answering it

    response = retry_any(headers, cid, message_id)

    assert response.status_code == 409
    assert response.json() == {"detail": "This question is already being answered.", "code": "reply_in_progress"}
    listed = client.get(f"/conversations/{cid}/messages", headers=headers).json()[0]
    assert listed["status"] == "sending"
    # How long until it counts as failed: the server's cut-off, minus the 5
    # seconds it has been answering. In the header, and in the list.
    from app.routers.conversations import stuck_after

    left = stuck_after().total_seconds() - 5
    assert left - 3 <= int(response.headers["retry-after"]) <= left + 1
    assert left - 3 <= listed["retry_in"] <= left + 1


def test_a_question_left_sending_by_a_request_that_died_counts_as_failed(client, db, failed, retry_any, fake_ai):
    from app.routers.conversations import stuck_after

    headers, cid, message_id = failed
    set_sending(db, message_id, ago=stuck_after() + timedelta(seconds=1))

    # The chat sees it as failed, with Retry...
    assert client.get(f"/conversations/{cid}/messages", headers=headers).json()[0]["status"] == STATUS_FAILED
    assert listing(client, headers)[cid]["last_message_failed"] is True
    # ...and a retry claims it and answers it
    assert retry_any(headers, cid, message_id).status_code == 201
    assert messages(db) == [("user", "Is pickup free in Lekki?", STATUS_SENT), ("assistant", fake_ai.reply, STATUS_SENT)]


def test_still_sending_within_the_time_the_ai_could_take_is_not_stuck(client, db, failed):
    from app.routers.conversations import stuck_after

    headers, cid, message_id = failed
    set_sending(db, message_id, ago=stuck_after() - timedelta(seconds=10))

    assert client.get(f"/conversations/{cid}/messages", headers=headers).json()[0]["status"] == "sending"
    assert listing(client, headers)[cid]["last_message_failed"] is False


def test_stuck_after_allows_for_both_ai_calls(monkeypatch):
    from app.routers.conversations import stuck_after

    monkeypatch.setattr(settings, "ai_timeout_seconds", 45)

    assert stuck_after() == timedelta(seconds=120)  # the embedding, the reply, and 30 seconds


def test_a_retry_that_fails_goes_back_to_failed(client, db, failed, retry_any, fake_ai):
    headers, cid, message_id = failed
    fake_ai.fail = True

    assert retry_any(headers, cid, message_id).status_code == 502

    db.expire_all()
    assert db.execute(select(Message.status, Message.sending_since)).one() == (STATUS_FAILED, None)
    fake_ai.fail = False
    assert retry_any(headers, cid, message_id).status_code == 201  # and can be retried again


def test_sending_since_is_set_exactly_while_sending(db, client, auth_headers):
    headers = auth_headers()
    cid = start(client, headers)
    db.add(Message(conversation_id=cid, role="user", content="Hello", status="sending"))
    with pytest.raises(IntegrityError, match="ck_messages_sending_since_while_sending"):
        db.commit()


def test_only_a_question_being_answered_has_retry_in(client, failed, auth_headers, fake_ai):
    headers, cid, _ = failed  # failed: nothing to wait for
    assert client.get(f"/conversations/{cid}/messages", headers=headers).json()[0]["retry_in"] is None
    other = start(client, headers)
    ask(client, headers, other)  # sent, and its reply
    assert {m["retry_in"] for m in client.get(f"/conversations/{other}/messages", headers=headers).json()} == {None}
