"""Answer outcomes, answer sources, and resolving conversations."""
import pytest
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.models import Conversation, Message, MessageSource, User
from app.models.message import OUTCOME_ANSWERED, OUTCOME_NO_INFO
from app.models.user import ROLE_ADMIN
from app.services import ai
from app.services.outcomes import detect_outcome, sources_for
from app.services.retrieval import RetrievedChunk
from tests.conftest import vector

RELEVANT = [RetrievedChunk("shipping.md", "Delivery > Abuja\n\n3 to 5 days.", 0.62, document_id=1)]
ALWAYS = [RetrievedChunk("contact.md", "Contact > Email\n\nsupport@example.test", None, document_id=2)]


# Outcome detection ---------------------------------------------------------

def test_a_normal_reply_is_answered():
    assert detect_outcome("Delivery to Abuja takes 3 to 5 business days.", RELEVANT + ALWAYS) == OUTCOME_ANSWERED


def test_a_reply_opening_with_the_phrase_is_no_info():
    reply = "I don't have information about a silk evening gown. Please contact support."
    assert detect_outcome(reply, RELEVANT + ALWAYS) == OUTCOME_NO_INFO


@pytest.mark.parametrize("reply", [
    "   I DON'T HAVE INFORMATION about that.",
    "\n\ti don't have information on laptops.",
    "I Don’t Have Information about that.",  # a curly apostrophe, as models often write
])
def test_the_opening_phrase_ignores_case_leading_spaces_and_apostrophe_style(reply):
    assert detect_outcome(reply, RELEVANT) == OUTCOME_NO_INFO


def test_the_phrase_later_in_the_reply_is_no_info_when_nothing_relevant_was_found():
    reply = "Sorry! I don't have information about laptops."
    assert detect_outcome(reply, ALWAYS) == OUTCOME_NO_INFO  # only the always included contact details
    assert detect_outcome(reply, []) == OUTCOME_NO_INFO  # the search failed


def test_the_phrase_later_in_the_reply_is_answered_when_something_relevant_was_found():
    reply = "Delivery takes 3 to 5 days. I don't have information about Sunday deliveries."
    assert detect_outcome(reply, RELEVANT + ALWAYS) == OUTCOME_ANSWERED


def test_a_reply_without_the_phrase_is_answered_even_if_nothing_was_found():
    assert detect_outcome("You can reach us at support@example.test.", ALWAYS) == OUTCOME_ANSWERED


# Sources -------------------------------------------------------------------

def test_sources_are_one_per_document_with_its_best_similarity():
    chunks = [
        RetrievedChunk("shipping.md", "a", 0.41, document_id=1),
        RetrievedChunk("returns.md", "b", 0.55, document_id=3),
        RetrievedChunk("shipping.md", "c", 0.62, document_id=1),
        *ALWAYS,
    ]

    sources = [(s.document_id, s.document_name, s.similarity) for s in sources_for(chunks)]

    assert sources == [(1, "shipping.md", 0.62), (3, "returns.md", 0.55), (2, "contact.md", None)]


# Recording outcome and sources when a reply is saved ------------------------

@pytest.fixture
def knowledge(add_document, monkeypatch):
    """Two chunks of one document match the question; contact.md is always included."""
    returns = add_document("returns.md", [
        ("Returns > Window\n\n14 days from delivery.", vector(d0=1.0)),
        ("Returns > Refunds\n\n5 to 7 business days.", vector(d0=0.8, d1=0.6)),
    ])
    contact = add_document("contact.md", [("Contact > Email\n\nsupport@example.test", vector(d5=1.0))])
    monkeypatch.setitem(ai._EMBEDDING_PROVIDERS, "openrouter", lambda texts, mode: [vector(d0=1.0) for _ in texts])
    return {"returns": returns, "contact": contact}


@pytest.fixture
def chat(client, auth_headers):
    headers = auth_headers("customer@example.com")
    conversation_id = client.post("/conversations", headers=headers).json()["id"]

    def send(text):
        return client.post(f"/conversations/{conversation_id}/messages", json={"content": text}, headers=headers)

    send.conversation_id = conversation_id
    send.headers = headers
    return send


def latest_reply(db, conversation_id):
    db.expire_all()
    return db.scalars(
        select(Message).where(Message.conversation_id == conversation_id, Message.role == "assistant")
        .order_by(Message.id.desc())
    ).first()


def test_a_reply_is_saved_with_its_outcome_and_one_source_per_document(db, chat, knowledge, fake_ai):
    fake_ai.reply = "You can return an item within 14 days of delivery."

    assert chat("How long do I have to return something?").status_code == 201

    reply = latest_reply(db, chat.conversation_id)
    assert reply.outcome == OUTCOME_ANSWERED
    # Two returns chunks, one row for the document, with the better score
    assert [(s.document_id, s.document_name) for s in reply.sources] == [
        (knowledge["returns"].id, "returns.md"), (knowledge["contact"].id, "contact.md"),
    ]
    assert reply.sources[0].similarity == pytest.approx(1.0)
    assert reply.sources[1].similarity is None  # always included, not retrieved


def test_a_reply_that_cant_answer_is_saved_as_no_info(db, chat, knowledge, fake_ai):
    fake_ai.reply = "I don't have information about that. You can email support@example.test."

    chat("Do you sell laptops?")

    assert latest_reply(db, chat.conversation_id).outcome == OUTCOME_NO_INFO


def test_retry_saves_the_outcome_and_sources_too(client, db, chat, knowledge, fake_ai):
    fake_ai.fail = True
    assert chat("How long do I have to return something?").status_code == 502
    fake_ai.fail = False
    fake_ai.reply = "I don't have information about that."

    response = client.post(f"/conversations/{chat.conversation_id}/retry", headers=chat.headers)

    assert response.status_code == 201
    reply = latest_reply(db, chat.conversation_id)
    assert reply.outcome == OUTCOME_NO_INFO
    assert {s.document_name for s in reply.sources} == {"returns.md", "contact.md"}


def test_customers_never_see_outcomes_or_sources(client, chat, knowledge):
    reply = chat("Returns?").json()
    history = client.get(f"/conversations/{chat.conversation_id}/messages", headers=chat.headers).json()

    assert set(reply) == {"id", "role", "content", "created_at"}
    assert all(set(m) == {"id", "role", "content", "created_at"} for m in history)


def test_a_deleted_document_leaves_its_name_on_the_source(client, db, chat, add_document, auth_headers, monkeypatch):
    upload = add_document("gift-wrapping.txt", [("Gift wrapping\n\nWrapping costs extra.", vector(d0=1.0))], source_type="upload")
    monkeypatch.setitem(ai._EMBEDDING_PROVIDERS, "openrouter", lambda texts, mode: [vector(d0=1.0) for _ in texts])
    chat("Do you gift wrap?")
    admin = auth_headers("admin@example.com")
    db.execute(update(User).where(User.email == "admin@example.com").values(role=ROLE_ADMIN))
    db.commit()

    assert client.delete(f"/admin/knowledge/documents/{upload.id}", headers=admin).status_code == 204

    [source] = latest_reply(db, chat.conversation_id).sources
    assert source.document_id is None
    assert source.document_name == "gift-wrapping.txt"


def test_deleting_a_message_deletes_its_sources(db, chat, knowledge):
    chat("Returns?")
    reply = latest_reply(db, chat.conversation_id)
    assert reply.sources

    db.delete(reply)
    db.commit()

    assert db.scalars(select(MessageSource).where(MessageSource.message_id == reply.id)).all() == []


# The database rejects inconsistent data ------------------------------------

@pytest.mark.parametrize("role, outcome", [("assistant", "maybe"), ("user", OUTCOME_ANSWERED)])
def test_the_database_rejects_a_bad_outcome(db, chat, role, outcome):
    db.add(Message(conversation_id=chat.conversation_id, role=role, content="x", outcome=outcome))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_the_database_rejects_a_resolver_without_a_resolution(db, chat):
    admin_id = db.scalar(select(User.id))
    conversation = db.get(Conversation, chat.conversation_id)
    conversation.resolved_by = admin_id
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


# Resolving and reopening ----------------------------------------------------

@pytest.fixture
def admin(auth_headers, db):
    headers = auth_headers("admin@example.com")
    db.execute(update(User).where(User.email == "admin@example.com").values(role=ROLE_ADMIN))
    db.commit()
    return headers


def admin_id(db):
    return db.scalar(select(User.id).where(User.email == "admin@example.com"))


def test_an_admin_can_resolve_a_conversation(client, db, chat, admin):
    chat("Where is my order?")

    response = client.post(f"/admin/conversations/{chat.conversation_id}/resolve", headers=admin)

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == chat.conversation_id
    assert body["resolved_at"] is not None
    assert body["resolved_by"] == admin_id(db)


def test_resolving_twice_keeps_the_first_resolution(client, chat, admin):
    url = f"/admin/conversations/{chat.conversation_id}/resolve"
    first = client.post(url, headers=admin).json()

    assert client.post(url, headers=admin).json() == first


def test_an_admin_can_reopen_a_conversation(client, db, chat, admin):
    client.post(f"/admin/conversations/{chat.conversation_id}/resolve", headers=admin)

    response = client.post(f"/admin/conversations/{chat.conversation_id}/reopen", headers=admin)

    assert response.status_code == 200
    assert response.json() == {"id": chat.conversation_id, "resolved_at": None, "resolved_by": None}
    db.expire_all()
    assert db.get(Conversation, chat.conversation_id).resolved_at is None


def test_reopening_an_open_conversation_changes_nothing(client, chat, admin):
    response = client.post(f"/admin/conversations/{chat.conversation_id}/reopen", headers=admin)

    assert response.status_code == 200
    assert response.json()["resolved_at"] is None


def test_a_new_customer_message_reopens_a_resolved_conversation(client, db, chat, admin):
    chat("Where is my order?")
    client.post(f"/admin/conversations/{chat.conversation_id}/resolve", headers=admin)

    assert chat("It still hasn't arrived.").status_code == 201

    db.expire_all()
    conversation = db.get(Conversation, chat.conversation_id)
    assert conversation.resolved_at is None
    assert conversation.resolved_by is None


@pytest.mark.parametrize("action", ["resolve", "reopen"])
def test_resolve_and_reopen_need_a_token(client, chat, action):
    response = client.post(f"/admin/conversations/{chat.conversation_id}/{action}")

    assert response.status_code == 401


@pytest.mark.parametrize("action", ["resolve", "reopen"])
def test_customers_cannot_resolve_or_reopen(client, db, chat, action):
    response = client.post(f"/admin/conversations/{chat.conversation_id}/{action}", headers=chat.headers)

    assert response.status_code == 403
    db.expire_all()
    assert db.get(Conversation, chat.conversation_id).resolved_at is None


@pytest.mark.parametrize("action", ["resolve", "reopen"])
def test_resolve_and_reopen_404_for_an_unknown_conversation(client, admin, action):
    response = client.post(f"/admin/conversations/999999/{action}", headers=admin)

    assert response.status_code == 404
    assert response.json() == {"detail": "Conversation not found"}


@pytest.mark.parametrize("action", ["resolve", "reopen"])
def test_resolve_and_reopen_reject_an_id_that_isnt_a_number(client, admin, action):
    assert client.post(f"/admin/conversations/abc/{action}", headers=admin).status_code == 422
