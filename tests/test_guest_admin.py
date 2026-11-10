"""Guests over time and in the admin dashboard: cleanup, labels and counts."""
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.cli import guests as guests_cli
from app.core.config import settings
from app.models import Conversation, Message, MessageSource, User
from tests.test_admin_api import ANSWERED, admin, make_conversation, make_user  # noqa: F401 (fixtures)

NOW = datetime.now(UTC)


@pytest.fixture
def make_guest(db):
    def _make(age=timedelta(hours=1)):
        guest = User(is_guest=True, created_at=NOW - age)
        db.add(guest)
        db.commit()
        return guest

    return _make


@pytest.fixture
def with_sources(db):
    """with_sources(conversation): gives each reply an "Answered from" row."""

    def _add(conversation):
        for message in db.scalars(select(Message).where(Message.conversation_id == conversation.id, Message.role == "assistant")):
            db.add(MessageSource(message_id=message.id, document_name="shipping.md", similarity=0.6))
        db.commit()

    return _add


def counts(db) -> dict[str, int]:
    db.expire_all()
    return {
        name: db.scalar(select(func.count()).select_from(model))
        for name, model in [("users", User), ("conversations", Conversation), ("messages", Message),
                            ("sources", MessageSource)]
    }


# Cleanup ---------------------------------------------------------------------


def test_cleanup_deletes_old_guests_and_everything_they_had(db, make_guest, make_conversation, with_sources):
    old = make_guest(age=timedelta(days=8))
    with_sources(make_conversation(old, ("user", "Delivery to Kano?"), ANSWERED))
    make_conversation(old, ("user", "And returns?"))

    assert guests_cli.delete_old_guests(db) == (1, 2)

    assert counts(db) == {"users": 0, "conversations": 0, "messages": 0, "sources": 0}


def test_cleanup_keeps_recent_guests(db, make_guest, make_conversation):
    recent = make_guest(age=timedelta(days=6, hours=23))
    make_conversation(recent, ("user", "Hello"), ANSWERED)

    assert guests_cli.delete_old_guests(db) == (0, 0)
    assert counts(db)["messages"] == 2


def test_cleanup_never_touches_accounts(db, make_guest, make_user, make_conversation, with_sources):
    account = make_user("ada@example.com", joined=NOW - timedelta(days=400))
    with_sources(make_conversation(account, ("user", "Hello"), ANSWERED, started=NOW - timedelta(days=300)))
    make_guest(age=timedelta(days=30))

    assert guests_cli.delete_old_guests(db) == (1, 0)

    assert counts(db) == {"users": 1, "conversations": 1, "messages": 2, "sources": 1}
    assert db.scalar(select(User.email)) == "ada@example.com"


def test_cleanup_follows_the_retention_setting(db, make_guest, monkeypatch):
    monkeypatch.setattr(settings, "guest_retention_days", 2)
    make_guest(age=timedelta(days=3))
    make_guest(age=timedelta(days=1))

    assert guests_cli.delete_old_guests(db) == (1, 0)


def test_the_cleanup_command(monkeypatch, capsys, session_factory, make_guest):
    monkeypatch.setattr(guests_cli, "SessionLocal", session_factory)
    monkeypatch.setattr("sys.argv", ["guests", "cleanup"])
    make_guest(age=timedelta(days=10))

    assert guests_cli.main() == 0
    assert "deleted 1 guests older than 7 days, and their 0 conversations" in capsys.readouterr().out


def test_the_start_script_runs_the_cleanup():
    script = open("scripts/start.sh").read()
    assert "python -m app.cli.guests cleanup" in script
    # Before the API starts, and a failure doesn't stop it
    assert script.index("app.cli.guests cleanup") < script.index("exec uvicorn")
    assert "if ! python -m app.cli.guests cleanup" in script


def test_uvicorn_ignores_x_forwarded_for():
    assert "--no-proxy-headers" in open("scripts/start.sh").read()


# In the admin dashboard ---------------------------------------------------------


def test_guest_conversations_are_labelled_guest(client, admin, make_guest, make_user, make_conversation):
    make_conversation(make_guest(), ("user", "Is pickup free?"))
    make_conversation(make_user("ada@example.com"), ("user", "Do you ship to Accra?"), ANSWERED)

    items = client.get("/admin/conversations", headers=admin).json()["items"]

    owners = {i["title"]: (i["owner_email"], i["owner_is_guest"]) for i in items}
    assert owners == {"Is pickup free?": (None, True), "Do you ship to Accra?": ("ada@example.com", False)}


def test_a_guest_conversation_in_the_attention_list(client, admin, make_guest, make_conversation):
    make_conversation(make_guest(), ("user", "Is pickup free?"))  # unanswered

    items = client.get("/admin/conversations?filter=attention", headers=admin).json()["items"]

    assert [(i["owner_is_guest"], i["attention_reason"]) for i in items] == [(True, "unanswered")]


def test_a_guest_conversations_detail(client, admin, make_guest, make_conversation):
    conversation = make_conversation(make_guest(), ("user", "Is pickup free?"), ANSWERED)

    body = client.get(f"/admin/conversations/{conversation.id}", headers=admin).json()

    assert body["conversation"]["owner_is_guest"] is True
    assert (body["customer"]["email"], body["customer"]["is_guest"]) == (None, True)
    assert body["customer"]["questions_asked"] == 1


def test_customers_lists_accounts_only(client, admin, make_guest, make_user):
    make_user("ada@example.com")
    make_guest()
    make_guest()

    body = client.get("/admin/users", headers=admin).json()

    assert sorted(u["email"] for u in body["items"]) == ["ada@example.com", "admin@example.com"]
    assert body["total"] == 2


def test_overview_counts_guest_conversations_separately(client, admin, make_guest, make_user, make_conversation):
    ada = make_user("ada@example.com")
    make_conversation(ada, ("user", "Hello"), ANSWERED)
    for _ in range(3):
        make_conversation(make_guest(), ("user", "Hi"), ANSWERED)
    # A guest's conversation from before the range isn't counted
    make_conversation(make_guest(age=timedelta(days=20)), ("user", "Hi"), started=NOW - timedelta(days=20))

    stats = client.get("/admin/stats?range=7d", headers=admin).json()

    assert stats["conversations"] == 4  # everyone's
    assert stats["guest_conversations"] == 3  # of which guests started
    assert stats["customers"] == 1  # accounts only: ada (the admin isn't a customer)
