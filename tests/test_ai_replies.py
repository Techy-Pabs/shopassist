"""The OpenRouter reply function, with a fake client (no network)."""

from types import SimpleNamespace

import pytest

from app.services import ai
from app.services.ai import AIServiceError, looks_like_classifier_label


def fake_client(content, model="some/model:free"):
    response = SimpleNamespace(
        model=model,
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
    )
    completions = SimpleNamespace(create=lambda **kwargs: response)
    return SimpleNamespace(chat=SimpleNamespace(completions=completions))


@pytest.fixture
def reply_with(monkeypatch):
    def _reply_with(content, model="some/model:free"):
        monkeypatch.setattr(ai, "_openrouter_client", lambda: fake_client(content, model))
        return ai._openrouter_reply("system prompt", [{"role": "user", "content": "Hi"}])

    return _reply_with


@pytest.mark.parametrize("label", [
    "User Safety: safe",
    "User Safety: unsafe",
    "  user safety : SAFE  ",
    "Response Safety: safe",
    "Safety: unsafe\nCategories: none",
    "**User Safety:** safe",
    "safe",
    "Unsafe.",
])
def test_classifier_labels_are_failed_replies(reply_with, label, caplog):
    with pytest.raises(AIServiceError):
        reply_with(label, model="nvidia/nemotron-3.5-content-safety:free")

    assert "safety classifier label" in caplog.text
    assert "nvidia/nemotron-3.5-content-safety:free" in caplog.text


@pytest.mark.parametrize("reply", [
    "Delivery to Abuja takes 3 to 5 business days.",
    "For your safety, please don't share your card number here.",
    "It's safe to wash linen at 30 degrees.",
    "Safe travels! Your order ships today.",
])
def test_normal_replies_pass(reply_with, reply):
    assert reply_with(reply) == reply


def test_label_detection_directly():
    assert looks_like_classifier_label("User Safety: safe")
    assert not looks_like_classifier_label("User safety is important to us.")


def test_chat_returns_502_when_the_model_replies_with_a_label(client, auth_headers, db, monkeypatch):
    from sqlalchemy import select

    from app.models import Message
    from app.routers import conversations

    # Use the real generate_reply (conftest's fake AI is replaced) with a fake client
    monkeypatch.setattr(conversations, "generate_reply", ai.generate_reply)
    monkeypatch.setitem(ai._PROVIDERS, "openrouter", ai._openrouter_reply)
    monkeypatch.setattr(ai, "_openrouter_client", lambda: fake_client("User Safety: safe"))
    headers = auth_headers()
    cid = client.post("/conversations", headers=headers).json()["id"]

    response = client.post(f"/conversations/{cid}/messages", json={"content": "Hello?"}, headers=headers)

    assert response.status_code == 502
    roles = db.scalars(select(Message.role).where(Message.conversation_id == cid)).all()
    assert roles == ["user"]  # no assistant message saved


# --- Fallback models ---

def recording_client(model_that_answers, calls):
    response = SimpleNamespace(
        model=model_that_answers,
        choices=[SimpleNamespace(message=SimpleNamespace(content="A normal reply."))],
    )

    def create(**kwargs):
        calls.append(kwargs)
        return response

    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


@pytest.fixture
def models(monkeypatch):
    from app.core.config import settings

    def _models(primary, fallbacks):
        monkeypatch.setattr(settings, "ai_model", primary)
        monkeypatch.setattr(settings, "ai_fallback_models", fallbacks)
        return settings

    return _models


def test_fallback_models_are_sent_as_openrouters_list(monkeypatch, models):
    models("main/model:free", "backup/one:free, backup/two:free")
    calls = []
    monkeypatch.setattr(ai, "_openrouter_client", lambda: recording_client("main/model:free", calls))

    ai._openrouter_reply("system", [{"role": "user", "content": "Hi"}])

    assert calls[0]["model"] == "main/model:free"
    assert calls[0]["extra_body"] == {"models": ["main/model:free", "backup/one:free", "backup/two:free"]}


def test_no_fallback_list_without_fallbacks(monkeypatch, models):
    models("main/model:free", "")
    calls = []
    monkeypatch.setattr(ai, "_openrouter_client", lambda: recording_client("main/model:free", calls))

    ai._openrouter_reply("system", [{"role": "user", "content": "Hi"}])

    assert "extra_body" not in calls[0]


def test_repeated_models_are_sent_once(models):
    assert models("a:free", "b:free, a:free, b:free").ai_models == ["a:free", "b:free"]


def test_log_says_when_a_fallback_answered(monkeypatch, models, caplog):
    caplog.set_level("INFO", logger="app.services.ai")
    models("main/model:free", "backup/one:free")
    monkeypatch.setattr(ai, "_openrouter_client", lambda: recording_client("backup/one", []))

    ai._openrouter_reply("system", [{"role": "user", "content": "Hi"}])

    assert "model=backup/one (fallback; main/model:free did not answer)" in caplog.text


def test_log_has_no_fallback_note_when_the_main_model_answered(monkeypatch, models, caplog):
    caplog.set_level("INFO", logger="app.services.ai")
    models("main/model:free", "backup/one:free")
    # OpenRouter reports the model without ":free"
    monkeypatch.setattr(ai, "_openrouter_client", lambda: recording_client("main/model", []))

    ai._openrouter_reply("system", [{"role": "user", "content": "Hi"}])

    assert "model=main/model" in caplog.text
    assert "fallback" not in caplog.text
