"""The admin dashboard's API: stats, conversations, users and knowledge."""
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from app.models import Conversation, Document, Message, MessageSource, User
from app.models.message import OUTCOME_ANSWERED, OUTCOME_NO_INFO
from app.models.user import ROLE_ADMIN
from tests.conftest import vector

NOW = datetime.now(UTC)


def ago(**delta) -> datetime:
    return NOW - timedelta(**delta)


@pytest.fixture
def admin(auth_headers, db):
    headers = auth_headers("admin@example.com")
    db.execute(update(User).where(User.email == "admin@example.com").values(role=ROLE_ADMIN))
    db.commit()
    return headers


@pytest.fixture
def customer(auth_headers):
    return auth_headers("customer@example.com")


@pytest.fixture
def make_user(db):
    def _make(email, joined=None):
        user = User(email=email, hashed_password="not-a-real-hash", created_at=joined or ago(days=20))
        db.add(user)
        db.commit()
        return user

    return _make


@pytest.fixture
def make_conversation(db):
    """make_conversation(user, ("user", "text"), ("assistant", "text", outcome), ..., started=...)

    Messages are a minute apart, from when the conversation started.
    """

    def _make(user, *messages, started=None, title=None, resolved=False):
        started = started or ago(hours=1)
        conversation = Conversation(user_id=user.id, title=title or (messages[0][1] if messages else None),
                                    created_at=started)
        db.add(conversation)
        db.flush()
        for i, (role, content, *outcome) in enumerate(messages):
            db.add(Message(conversation_id=conversation.id, role=role, content=content,
                           outcome=outcome[0] if outcome else None, created_at=started + timedelta(minutes=i)))
        if resolved:
            when = started + timedelta(minutes=len(messages))
            conversation.resolved_at = conversation.last_resolved_at = when
        db.commit()
        return conversation

    return _make


ANSWERED = ("assistant", "Delivery takes 3 to 5 days.", OUTCOME_ANSWERED)
NO_INFO = ("assistant", "I don't have information about that.", OUTCOME_NO_INFO)


# Access: every endpoint is admin only ----------------------------------------

ENDPOINTS = [
    "/admin/stats",
    "/admin/conversations",
    "/admin/conversations/{cid}",
    "/admin/users",
    "/admin/knowledge/documents",
    "/admin/knowledge/limits",
]


@pytest.fixture
def cid(make_user, make_conversation):
    return make_conversation(make_user("buyer@example.com"), ("user", "Hello?")).id


@pytest.mark.parametrize("path", ENDPOINTS)
def test_no_token_gets_401(client, cid, path):
    assert client.get(path.format(cid=cid)).status_code == 401


@pytest.mark.parametrize("path", ENDPOINTS)
def test_customers_get_403(client, customer, cid, path):
    response = client.get(path.format(cid=cid), headers=customer)

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin access required"}


@pytest.mark.parametrize("path", ENDPOINTS)
def test_admins_get_200(client, admin, cid, path):
    assert client.get(path.format(cid=cid), headers=admin).status_code == 200


@pytest.mark.parametrize("path, query", [
    ("/admin/stats", "range=year"),
    ("/admin/conversations", "filter=open"),
    ("/admin/conversations", "limit=101"),
    ("/admin/conversations", "offset=-1"),
    ("/admin/conversations", "q=" + "x" * 201),
    ("/admin/users", "q=" + "x" * 201),
    ("/admin/users", "limit=0"),
    ("/admin/knowledge/documents", "source_type=web"),
    ("/admin/conversations/abc", ""),
])
def test_bad_input_gets_422(client, admin, path, query):
    assert client.get(f"{path}?{query}", headers=admin).status_code == 422


def test_unknown_conversation_gets_404(client, admin):
    response = client.get("/admin/conversations/999999", headers=admin)

    assert response.status_code == 404
    assert response.json() == {"detail": "Conversation not found"}


# Stats -------------------------------------------------------------------------

def test_stats_for_the_last_7_days(client, admin, db, make_user, make_conversation, add_document):
    chioma, tunde = make_user("chioma@example.com"), make_user("tunde@example.com")
    make_conversation(chioma, ("user", "Delivery?"), ANSWERED, started=ago(hours=2))
    make_conversation(chioma, ("user", "Silk gowns?"), NO_INFO, started=ago(days=1))
    make_conversation(tunde, ("user", "Change my address?"), started=ago(days=2))  # unanswered
    make_conversation(tunde, ("user", "Old question"), ("assistant", "An old reply."), started=ago(days=3))  # no outcome
    make_conversation(tunde, ("user", "Last week"), ANSWERED, started=ago(days=9))  # the 7 days before
    make_conversation(tunde, ("user", "Long ago"), ANSWERED, started=ago(days=40))  # neither
    add_document("returns.md", [("Returns > Window", vector(d0=1.0))])

    stats = client.get("/admin/stats?range=7d", headers=admin).json()

    assert stats["range"] == "7d"
    assert stats["conversations"] == 4
    assert stats["previous_conversations"] == 1
    assert stats["questions"] == 4
    assert stats["answered"] == 2  # the no outcome reply counts; "couldn't answer" doesn't
    assert stats["needs_attention"] == {"total": 2, "couldnt_answer": 1, "unanswered": 1}
    assert stats["knowledge"]["documents"] == 1
    assert stats["knowledge"]["last_updated"] is not None
    assert stats["customers"] == 2  # chioma and tunde; the admin isn't a customer
    assert len(stats["per_day"]) == 7
    assert sum(d["conversations"] for d in stats["per_day"]) == 4
    assert stats["per_day"][-1]["day"] == NOW.date().isoformat()


@pytest.mark.parametrize("range_name, days", [("today", 1), ("7d", 7), ("30d", 30)])
def test_stats_have_one_chart_entry_per_day_of_the_range(client, admin, range_name, days):
    stats = client.get(f"/admin/stats?range={range_name}", headers=admin).json()

    assert [d["conversations"] for d in stats["per_day"]] == [0] * days  # empty days included


def test_stats_default_to_7_days(client, admin):
    assert client.get("/admin/stats", headers=admin).json()["range"] == "7d"


def test_needs_attention_is_now_whatever_the_range(client, admin, make_user, make_conversation):
    make_conversation(make_user("old@example.com"), ("user", "Still waiting"), started=ago(days=40))

    stats = client.get("/admin/stats?range=today", headers=admin).json()

    assert stats["conversations"] == 0
    assert stats["needs_attention"]["unanswered"] == 1


# Stats in the store's time zone -------------------------------------------------

# 20 October, 12:00 UTC: 13:00 in Lagos (UTC+1) and 08:00 in New York (UTC-4)
FROZEN_NOW = datetime(2026, 10, 20, 12, 0, tzinfo=UTC)
LAGOS_JUST_BEFORE_MIDNIGHT = datetime(2026, 10, 19, 22, 45, tzinfo=UTC)  # 19 Oct 23:45 in Lagos
LAGOS_JUST_AFTER_MIDNIGHT = datetime(2026, 10, 19, 23, 30, tzinfo=UTC)  # 20 Oct 00:30 in Lagos
NEW_YORK_JUST_BEFORE_MIDNIGHT = datetime(2026, 10, 20, 3, 30, tzinfo=UTC)  # 19 Oct 23:30 in New York


@pytest.fixture
def around_midnight(monkeypatch, make_user, make_conversation):
    """Freeze "now", and add three conversations either side of local midnights."""
    from app.services import admin_queries

    real = admin_queries.range_bounds
    monkeypatch.setattr(admin_queries, "range_bounds", lambda name, zone, now=None: real(name, zone, FROZEN_NOW))
    ada = make_user("ada@example.com")
    for started in (LAGOS_JUST_BEFORE_MIDNIGHT, LAGOS_JUST_AFTER_MIDNIGHT, NEW_YORK_JUST_BEFORE_MIDNIGHT):
        make_conversation(ada, ("user", "Hello"), ANSWERED, started=started)


@pytest.fixture
def store_timezone(monkeypatch):
    from app.core.config import settings

    return lambda name: monkeypatch.setattr(settings, "store_timezone", name)


def chart(stats):
    return {d["day"]: d["conversations"] for d in stats["per_day"]}


def test_today_starts_at_midnight_in_the_store_time_zone(client, admin, around_midnight, store_timezone):
    store_timezone("Africa/Lagos")
    lagos = client.get("/admin/stats?range=today", headers=admin).json()
    store_timezone("UTC")
    utc = client.get("/admin/stats?range=today", headers=admin).json()
    store_timezone("America/New_York")
    new_york = client.get("/admin/stats?range=today", headers=admin).json()

    # 00:30 in Lagos is today there, but still yesterday in UTC and New York
    assert (lagos["conversations"], utc["conversations"], new_york["conversations"]) == (2, 1, 0)
    assert lagos["since"] == "2026-10-20T00:00:00+01:00"
    assert new_york["since"] == "2026-10-20T00:00:00-04:00"
    assert chart(lagos) == {"2026-10-20": 2}


def test_the_chart_puts_each_conversation_on_its_local_day(client, admin, around_midnight, store_timezone):
    store_timezone("Africa/Lagos")
    week = client.get("/admin/stats?range=7d", headers=admin).json()

    assert list(chart(week)) == [f"2026-10-{d}" for d in range(14, 21)]
    assert chart(week)["2026-10-19"] == 1  # 23:45 the night before
    assert chart(week)["2026-10-20"] == 2  # 00:30 and 04:30
    assert week["conversations"] == 3


def test_the_chart_in_new_york(client, admin, around_midnight, store_timezone):
    store_timezone("America/New_York")
    week = client.get("/admin/stats?range=7d", headers=admin).json()

    assert chart(week)["2026-10-19"] == 3  # all three were the evening of the 19th there
    assert chart(week)["2026-10-20"] == 0


# Conversations list ------------------------------------------------------------

def conversations(client, admin, query=""):
    return client.get(f"/admin/conversations?{query}", headers=admin).json()


def by_title(page):
    return {c["title"]: c for c in page["items"]}


def test_each_conversation_has_its_status(client, admin, make_user, make_conversation):
    ada = make_user("ada@example.com")
    make_conversation(ada, ("user", "Answered"), ANSWERED)
    make_conversation(ada, ("user", "Couldn't answer"), NO_INFO)
    make_conversation(ada, ("user", "Unanswered"))
    make_conversation(ada, ("user", "Resolved"), NO_INFO, resolved=True)

    items = by_title(conversations(client, admin))

    assert (items["Answered"]["status"], items["Answered"]["attention_reason"]) == ("open", None)
    assert (items["Couldn't answer"]["status"], items["Couldn't answer"]["attention_reason"]) == (
        "needs_attention", "couldnt_answer")
    assert (items["Unanswered"]["status"], items["Unanswered"]["attention_reason"]) == ("needs_attention", "unanswered")
    assert items["Resolved"]["status"] == "resolved"
    assert items["Resolved"]["resolved_at"] is not None
    assert items["Couldn't answer"]["owner_email"] == "ada@example.com"
    assert items["Couldn't answer"]["message_count"] == 2


def test_only_couldnt_answer_replies_after_the_last_resolution_count(client, admin, db, make_user, make_conversation):
    conversation = make_conversation(make_user("ada@example.com"), ("user", "Gowns?"), NO_INFO, resolved=True)
    # The customer writes again, which reopens it, and this time gets an answer
    conversation.resolved_at = None
    db.add(Message(conversation_id=conversation.id, role="user", content="Delivery?", created_at=ago(minutes=5)))
    db.add(Message(conversation_id=conversation.id, role="assistant", content="3 days.",
                   outcome=OUTCOME_ANSWERED, created_at=ago(minutes=4)))
    db.commit()

    [item] = conversations(client, admin)["items"]

    assert item["status"] == "open"  # the old "couldn't answer" was dealt with


def test_reopening_by_hand_brings_back_earlier_problems(client, admin, make_user, make_conversation):
    conversation = make_conversation(make_user("ada@example.com"), ("user", "Gowns?"), NO_INFO, resolved=True)

    client.post(f"/admin/conversations/{conversation.id}/reopen", headers=admin)

    [item] = conversations(client, admin)["items"]
    assert (item["status"], item["attention_reason"]) == ("needs_attention", "couldnt_answer")


def test_resolving_records_the_last_resolution(client, admin, db, make_user, make_conversation):
    conversation = make_conversation(make_user("ada@example.com"), ("user", "Gowns?"), NO_INFO)

    client.post(f"/admin/conversations/{conversation.id}/resolve", headers=admin)

    db.expire_all()
    saved = db.get(Conversation, conversation.id)
    assert saved.last_resolved_at == saved.resolved_at is not None


def test_filter_tabs_and_their_counts(client, admin, make_user, make_conversation):
    ada = make_user("ada@example.com")
    make_conversation(ada, ("user", "A"), ANSWERED)
    make_conversation(ada, ("user", "B"), NO_INFO)
    make_conversation(ada, ("user", "C"))
    make_conversation(ada, ("user", "D"), ANSWERED, resolved=True)

    everything = conversations(client, admin, "filter=all")
    attention = conversations(client, admin, "filter=attention")
    resolved = conversations(client, admin, "filter=resolved")

    assert everything["counts"] == attention["counts"] == {"all": 4, "attention": 2, "resolved": 1}
    assert sorted(by_title(attention)) == ["B", "C"]
    assert attention["total"] == 2
    assert list(by_title(resolved)) == ["D"]


def test_newest_activity_comes_first(client, admin, make_user, make_conversation):
    ada = make_user("ada@example.com")
    make_conversation(ada, ("user", "Older"), started=ago(days=2))
    make_conversation(ada, ("user", "Newer"), started=ago(hours=1))
    revived = make_conversation(ada, ("user", "Revived"), started=ago(days=5))
    make_conversation(ada, started=ago(minutes=1), title="Empty")

    titles = [c["title"] for c in conversations(client, admin)["items"]]

    assert titles == ["Empty", "Newer", "Older", "Revived"]
    assert revived.id  # an empty conversation's activity is when it started


def test_search_matches_questions_and_emails(client, admin, make_user, make_conversation):
    make_conversation(make_user("chioma@example.com"), ("user", "Do you sell SILK gowns?"), NO_INFO, title="One")
    make_conversation(make_user("tunde@example.com"), ("user", "Delivery to Abuja?"), ANSWERED, title="Two")
    make_conversation(make_user("ife@example.com"), ("user", "Hi"), ("assistant", "We sell silk scarves."), title="Three")

    assert list(by_title(conversations(client, admin, "q=silk"))) == ["One"]  # questions only, not replies
    assert list(by_title(conversations(client, admin, "q=TUNDE@"))) == ["Two"]
    page = conversations(client, admin, "q=silk&filter=resolved")
    assert page["items"] == [] and page["counts"] == {"all": 1, "attention": 1, "resolved": 0}


@pytest.mark.parametrize("q", ["%", "_", "100%", "x' OR '1'='1"])
def test_search_text_is_taken_literally(client, admin, make_user, make_conversation, q):
    make_conversation(make_user("ada@example.com"), ("user", "Delivery?"))

    assert conversations(client, admin, f"q={q}")["items"] == []


def test_conversations_page(client, admin, make_user, make_conversation):
    ada = make_user("ada@example.com")
    for n in range(5):
        make_conversation(ada, ("user", f"Q{n}"), started=ago(hours=n + 1))

    page = conversations(client, admin, "limit=2&offset=2")

    assert [c["title"] for c in page["items"]] == ["Q2", "Q3"]
    assert (page["total"], page["limit"], page["offset"]) == (5, 2, 2)


# Conversation detail -----------------------------------------------------------

@pytest.fixture
def detailed(db, make_user, make_conversation, add_document):
    """A conversation whose second reply used two documents and the contact details."""
    returns = add_document("returns.md", [("Returns > Window", vector(d0=1.0))])
    contact = add_document("contact.md", [("Contact > Email", vector(d5=1.0))])
    chioma = make_user("chioma@example.com", joined=ago(days=16))
    make_conversation(chioma, ("user", "Delivery to Lekki?"), ANSWERED, started=ago(days=7))
    make_conversation(chioma, ("user", "Returning a sale dress"), ANSWERED, started=ago(days=14))
    conversation = make_conversation(
        chioma, ("user", "Do you sell silk evening gowns?"), NO_INFO, ("user", "How much is the lace dress?"), ANSWERED,
    )
    reply = db.query(Message).filter_by(conversation_id=conversation.id, role="assistant").order_by(Message.id).all()[-1]
    db.add_all([
        MessageSource(message_id=reply.id, document_id=contact.id, document_name="contact.md", similarity=None),
        MessageSource(message_id=reply.id, document_id=None, document_name="old-sizes.md", similarity=0.41),
        MessageSource(message_id=reply.id, document_id=returns.id, document_name="returns.md", similarity=0.72),
    ])
    db.commit()
    return {"conversation": conversation, "returns": returns}


def test_detail_shows_every_message_with_its_outcome(client, admin, detailed):
    detail = client.get(f"/admin/conversations/{detailed['conversation'].id}", headers=admin).json()

    assert [(m["role"], m["outcome"]) for m in detail["messages"]] == [
        ("user", None), ("assistant", "no_info"), ("user", None), ("assistant", "answered"),
    ]
    assert detail["conversation"]["title"] == "Do you sell silk evening gowns?"
    assert detail["conversation"]["message_count"] == 4
    assert detail["conversation"]["status"] == "needs_attention"
    assert detail["resolved_by"] is None


def test_answered_from_leaves_out_always_included_documents(client, admin, detailed):
    detail = client.get(f"/admin/conversations/{detailed['conversation'].id}", headers=admin).json()

    # Best match first; contact.md (no score) is left out; a deleted document keeps its name
    assert detail["messages"][3]["sources"] == [
        {"document_id": detailed["returns"].id, "document_name": "returns.md", "similarity": 0.72},
        {"document_id": None, "document_name": "old-sizes.md", "similarity": 0.41},
    ]
    assert detail["messages"][1]["sources"] == []


def test_detail_includes_a_customer_summary(client, admin, detailed):
    customer = client.get(f"/admin/conversations/{detailed['conversation'].id}", headers=admin).json()["customer"]

    assert customer["email"] == "chioma@example.com"
    assert customer["joined"] is not None
    assert (customer["conversation_count"], customer["questions_asked"], customer["couldnt_answer"]) == (3, 4, 1)
    assert [c["title"] for c in customer["earlier_conversations"]] == ["Delivery to Lekki?", "Returning a sale dress"]


def test_detail_shows_at_most_5_earlier_conversations(client, admin, make_user, make_conversation):
    ada = make_user("ada@example.com")
    for n in range(7):
        make_conversation(ada, ("user", f"Earlier {n}"), started=ago(days=n + 1))
    current = make_conversation(ada, ("user", "Now"))

    customer = client.get(f"/admin/conversations/{current.id}", headers=admin).json()["customer"]

    assert [c["title"] for c in customer["earlier_conversations"]] == [f"Earlier {n}" for n in range(5)]


def test_message_text_is_returned_as_written(client, admin, make_user, make_conversation):
    attack = "<script>alert(1)</script><img src=x onerror=alert(2)>"
    conversation = make_conversation(make_user("x@example.com"), ("user", attack))

    detail = client.get(f"/admin/conversations/{conversation.id}", headers=admin).json()

    assert detail["messages"][0]["content"] == attack  # plain text; the dashboard shows it as text


# Users -------------------------------------------------------------------------

def test_users_have_counts_and_last_activity(client, admin, make_user, make_conversation):
    ada = make_user("ada@example.com", joined=ago(days=30))
    make_conversation(ada, ("user", "First"), ANSWERED, started=ago(days=3))
    make_conversation(ada, ("user", "Second"), started=ago(hours=2))
    make_user("quiet@example.com", joined=ago(days=1))

    users = {u["email"]: u for u in client.get("/admin/users", headers=admin).json()["items"]}

    assert users["ada@example.com"]["conversation_count"] == 2
    assert users["ada@example.com"]["last_active"].startswith(ago(hours=2).date().isoformat())
    assert users["quiet@example.com"]["conversation_count"] == 0
    assert users["quiet@example.com"]["last_active"] is None
    assert users["admin@example.com"]["role"] == "admin"


def test_users_search_by_email(client, admin, make_user):
    make_user("chioma.o@example.com")
    make_user("tunde.a@example.com")

    page = client.get("/admin/users?q=CHIOMA", headers=admin).json()

    assert [u["email"] for u in page["items"]] == ["chioma.o@example.com"]
    assert page["total"] == 1
    assert client.get("/admin/users?q=%25", headers=admin).json()["items"] == []  # "%" taken literally


def test_users_page_and_never_a_password_hash(client, admin, make_user):
    for n in range(4):
        make_user(f"user{n}@example.com", joined=ago(days=n + 1))

    response = client.get("/admin/users?limit=2&offset=1", headers=admin)

    page = response.json()
    assert [u["email"] for u in page["items"]] == ["user0@example.com", "user1@example.com"]  # after the admin
    assert page["total"] == 5
    assert "hash" not in response.text and "not-a-real-hash" not in response.text


# Knowledge ---------------------------------------------------------------------

@pytest.fixture
def documents(db, add_document, admin):
    add_document("returns.md", [("Returns > Window", vector(d0=1.0)), ("Returns > Refunds", vector(d1=1.0))])
    add_document("sizing.md", [("Sizing > Our sizes", vector(d2=1.0))])
    upload = add_document("gift-wrapping.txt", [("Gift wrapping > What we offer", vector(d3=1.0))], source_type="upload")
    admin_id = db.query(User.id).filter_by(email="admin@example.com").scalar()
    db.execute(update(Document).where(Document.id == upload.id).values(uploaded_by=admin_id))
    db.commit()
    return upload


def test_documents_filter_by_source_with_counts(client, admin, documents):
    built_in = client.get("/admin/knowledge/documents?source_type=folder", headers=admin).json()
    uploaded = client.get("/admin/knowledge/documents?source_type=upload", headers=admin).json()

    assert [d["source"] for d in built_in["items"]] == ["returns.md", "sizing.md"]
    assert [d["source"] for d in uploaded["items"]] == ["gift-wrapping.txt"]
    assert built_in["counts"] == uploaded["counts"] == {"all": 3, "folder": 2, "upload": 1}
    assert uploaded["items"][0]["uploaded_by_email"] == "admin@example.com"
    assert built_in["items"][0]["chunk_count"] == 2  # sections
    assert built_in["items"][0]["uploaded_by_email"] is None


def test_documents_search(client, admin, documents):
    page = client.get("/admin/knowledge/documents?q=GIFT", headers=admin).json()

    assert [d["source"] for d in page["items"]] == ["gift-wrapping.txt"]
    assert page["counts"] == {"all": 1, "folder": 0, "upload": 1}


def test_document_detail_has_every_section_in_full(client, admin, db, add_document):
    long_text = "Returns > Window\n\n" + "Fourteen days. " * 40
    doc = add_document("returns.md", [(long_text, vector(d0=1.0)), ("Returns > Refunds", vector(d1=1.0))])

    detail = client.get(f"/admin/knowledge/documents/{doc.id}", headers=admin).json()

    assert [s["content"] for s in detail["sections"]] == [long_text, "Returns > Refunds"]
    assert detail["preview"][0]["content"].endswith("...")  # the short preview is unchanged


def test_upload_limits_come_from_the_settings(client, admin):
    from app.core.config import settings

    limits = client.get("/admin/knowledge/limits", headers=admin).json()

    assert limits == {
        "accepted_types": [".pdf", ".docx", ".txt", ".md"], "max_file_bytes": settings.upload_max_file_bytes,
        "max_pdf_pages": settings.upload_max_pdf_pages, "max_chars": settings.upload_max_chars,
        "max_chunks": settings.upload_max_chunks,
    }


# No query per row ----------------------------------------------------------------

def queries_for(client, admin, count_queries, path):
    with count_queries() as counter:
        assert client.get(path, headers=admin).status_code == 200
    return counter.count


@pytest.mark.parametrize("path", ["/admin/conversations", "/admin/users", "/admin/knowledge/documents",
                                  "/admin/stats", "/admin/conversations?q=delivery&filter=attention"])
def test_lists_run_the_same_queries_for_2_rows_as_for_12(client, admin, count_queries, make_user,
                                                         make_conversation, add_document, path):
    def add_rows(n):
        for i in range(n):
            user = make_user(f"{path.count('/')}-{i}-{len(str(n))}@example.com")
            make_conversation(user, ("user", "Delivery?"), NO_INFO)
            add_document(f"doc-{i}-{n}.md", [("Doc > A", vector(d0=1.0))])

    add_rows(2)
    few = queries_for(client, admin, count_queries, path)
    add_rows(10)
    many = queries_for(client, admin, count_queries, path)

    assert many == few
    assert few <= 8


def test_conversation_detail_runs_the_same_queries_for_any_length(client, admin, count_queries, make_user,
                                                                  make_conversation):
    ada = make_user("ada@example.com")
    short = make_conversation(ada, ("user", "Q"), ANSWERED)
    long = make_conversation(ada, *[("user", f"Q{n}") if n % 2 == 0 else ANSWERED for n in range(20)])

    assert queries_for(client, admin, count_queries, f"/admin/conversations/{short.id}") == \
        queries_for(client, admin, count_queries, f"/admin/conversations/{long.id}")
