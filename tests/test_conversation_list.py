from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.models import Conversation, Message


def start(client, headers, title=None):
    return client.post("/conversations", json={"title": title} if title else None, headers=headers).json()["id"]


def say(client, headers, cid, text):
    return client.post(f"/conversations/{cid}/messages", json={"content": text}, headers=headers)


def listing(client, headers, query=""):
    return client.get(f"/conversations{query}", headers=headers).json()


# --- Titles ---

def test_first_message_names_an_untitled_conversation(client, auth_headers):
    headers = auth_headers()
    cid = start(client, headers)

    say(client, headers, cid, "How long does delivery to Abuja take?")

    assert listing(client, headers)[0]["title"] == "How long does delivery to Abuja take?"


def test_long_first_message_is_cut_at_a_word_boundary(client, auth_headers):
    headers = auth_headers()
    cid = start(client, headers)

    say(client, headers, cid, "I bought a dress on sale and it doesn't fit. Can I return it for a refund?")

    title = listing(client, headers)[0]["title"]
    # The first 60 characters end exactly before a space, so no word is split
    assert title == "I bought a dress on sale and it doesn't fit. Can I return it…"
    assert len(title) <= 61


def test_later_messages_dont_change_the_title(client, auth_headers):
    headers = auth_headers()
    cid = start(client, headers)
    say(client, headers, cid, "First question")

    say(client, headers, cid, "Second question")

    assert listing(client, headers)[0]["title"] == "First question"


def test_an_existing_title_is_kept(client, auth_headers):
    headers = auth_headers()
    cid = start(client, headers, title="My delivery")

    say(client, headers, cid, "Where is my order?")

    assert listing(client, headers)[0]["title"] == "My delivery"


def test_title_is_set_even_when_the_ai_fails(client, auth_headers, fake_ai):
    headers = auth_headers()
    cid = start(client, headers)
    fake_ai.fail = True

    assert say(client, headers, cid, "Is anyone there?").status_code == 502

    assert listing(client, headers)[0]["title"] == "Is anyone there?"


# --- updated_at and last_message_preview ---

def test_preview_is_the_latest_message(client, auth_headers, fake_ai):
    headers = auth_headers()
    cid = start(client, headers)
    fake_ai.reply = "Delivery to Abuja takes 3 to 5 business days and costs ₦6,000. Orders over ₦100,000 ship free."

    say(client, headers, cid, "How long does delivery to Abuja take?")

    [item] = listing(client, headers)
    assert item["last_message_preview"] == "Delivery to Abuja takes 3 to 5 business days and costs ₦6,000. Orders over…"
    assert len(item["last_message_preview"]) <= 81


def test_a_conversation_without_messages(client, auth_headers):
    headers = auth_headers()
    start(client, headers)

    [item] = listing(client, headers)

    assert item["last_message_preview"] is None
    assert item["updated_at"] == item["created_at"]
    assert item["title"] is None


def test_updated_at_is_the_latest_message_time(client, auth_headers, db):
    headers = auth_headers()
    cid = start(client, headers)
    say(client, headers, cid, "Hello")
    later = datetime(2030, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    db.execute(update(Message).where(Message.conversation_id == cid, Message.role == "assistant").values(created_at=later))
    db.commit()

    [item] = listing(client, headers)

    assert datetime.fromisoformat(item["updated_at"]) == later


def test_most_recent_activity_comes_first(client, auth_headers, db):
    headers = auth_headers()
    older = start(client, headers)
    newer = start(client, headers)
    # The older conversation gets a new message, so it moves to the top
    say(client, headers, older, "Back again")
    db.execute(update(Conversation).where(Conversation.id == newer).values(
        created_at=datetime.now(timezone.utc) - timedelta(minutes=5)))
    db.commit()

    assert [c["id"] for c in listing(client, headers)] == [older, newer]


def test_only_your_own_conversations_are_listed(client, auth_headers):
    alice, bob = auth_headers("alice@example.com"), auth_headers("bob@example.com")
    say(client, alice, start(client, alice), "Alice's question")

    assert listing(client, bob) == []


# --- limit ---

def test_limit_defaults_to_50_and_caps_the_list(client, auth_headers):
    headers = auth_headers()
    for _ in range(3):
        start(client, headers)

    assert len(listing(client, headers, "?limit=2")) == 2
    assert len(listing(client, headers)) == 3


def test_limit_over_100_is_rejected(client, auth_headers):
    headers = auth_headers()

    assert client.get("/conversations?limit=101", headers=headers).status_code == 422
    assert client.get("/conversations?limit=0", headers=headers).status_code == 422
