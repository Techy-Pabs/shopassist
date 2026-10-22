from sqlalchemy import select

from app.models import Message


def roles(db, cid):
    db.expire_all()
    return list(db.scalars(select(Message.role).where(Message.conversation_id == cid).order_by(Message.id)))


def start(client, headers):
    return client.post("/conversations", headers=headers).json()["id"]


def test_retry_answers_the_question_after_a_failed_reply(client, db, auth_headers, fake_ai):
    headers = auth_headers()
    cid = start(client, headers)
    fake_ai.fail = True
    assert client.post(f"/conversations/{cid}/messages", json={"content": "Delivery to Abuja?"}, headers=headers).status_code == 502
    fake_ai.fail = False
    fake_ai.reply = "Delivery to Abuja takes 3 to 5 business days."

    response = client.post(f"/conversations/{cid}/retry", headers=headers)

    assert response.status_code == 201
    assert response.json()["role"] == "assistant"
    assert response.json()["content"] == "Delivery to Abuja takes 3 to 5 business days."
    assert roles(db, cid) == ["user", "assistant"]  # the question is stored once


def test_retry_sends_the_same_history_and_store_information_path(client, db, auth_headers, fake_ai):
    headers = auth_headers()
    cid = start(client, headers)
    fake_ai.fail = True
    client.post(f"/conversations/{cid}/messages", json={"content": "Can I return earrings?"}, headers=headers)
    fake_ai.fail = False

    client.post(f"/conversations/{cid}/retry", headers=headers)

    retry_call = fake_ai.calls[-1]
    assert retry_call["history"] == [{"role": "user", "content": "Can I return earrings?"}]
    assert "<store_information>" in retry_call["system_prompt"]


def test_retry_when_the_question_already_has_a_reply_is_409(client, db, auth_headers, fake_ai):
    headers = auth_headers()
    cid = start(client, headers)
    client.post(f"/conversations/{cid}/messages", json={"content": "Hello"}, headers=headers)
    calls_before = len(fake_ai.calls)

    response = client.post(f"/conversations/{cid}/retry", headers=headers)

    assert response.status_code == 409
    assert response.json()["detail"] == "There is no unanswered question to retry."
    assert len(fake_ai.calls) == calls_before  # the AI wasn't asked
    assert roles(db, cid) == ["user", "assistant"]


def test_retry_on_an_empty_conversation_is_409(client, auth_headers):
    headers = auth_headers()
    cid = start(client, headers)

    assert client.post(f"/conversations/{cid}/retry", headers=headers).status_code == 409


def test_retry_that_fails_again_is_502_and_saves_nothing(client, db, auth_headers, fake_ai):
    headers = auth_headers()
    cid = start(client, headers)
    fake_ai.fail = True
    client.post(f"/conversations/{cid}/messages", json={"content": "Hello?"}, headers=headers)

    response = client.post(f"/conversations/{cid}/retry", headers=headers)

    assert response.status_code == 502
    assert roles(db, cid) == ["user"]


def test_retry_needs_your_own_conversation(client, auth_headers, fake_ai):
    alice, bob = auth_headers("alice@example.com"), auth_headers("bob@example.com")
    cid = start(client, alice)
    fake_ai.fail = True
    client.post(f"/conversations/{cid}/messages", json={"content": "Hello?"}, headers=alice)

    assert client.post(f"/conversations/{cid}/retry", headers=bob).status_code == 404
    assert client.post("/conversations/999999/retry", headers=alice).status_code == 404
    assert client.post(f"/conversations/{cid}/retry").status_code == 401


def test_retry_does_not_change_the_title(client, auth_headers, fake_ai):
    headers = auth_headers()
    cid = start(client, headers)
    fake_ai.fail = True
    client.post(f"/conversations/{cid}/messages", json={"content": "First question"}, headers=headers)
    fake_ai.fail = False

    client.post(f"/conversations/{cid}/retry", headers=headers)

    assert client.get("/conversations", headers=headers).json()[0]["title"] == "First question"
