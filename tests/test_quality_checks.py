import json

from app.cli.quality import check_reply, load_questions


def test_required_facts_and_banned_phrases():
    question = {"must_contain": [["3 to 5", "3-5"]], "must_not_contain": ["90% off"]}

    assert check_reply("It takes 3-5 business days.", question) == []
    assert check_reply("It takes a week.", question) == ["missing '3 to 5' / '3-5'"]
    assert check_reply("3 to 5 days, and 90% off!", question) == ["contains '90% off'"]


def test_internal_terms_are_banned_in_every_question(tmp_path):
    path = tmp_path / "questions.json"
    path.write_text(json.dumps({
        "no_internal_terms": ["store information"],
        "questions": [{"id": "a", "question": "?", "must_not_contain": ["x"]}, {"id": "b", "question": "?"}],
    }))

    questions = load_questions(path)

    assert [q["must_not_contain"] for q in questions] == [["x", "store information"], ["store information"]]
    assert check_reply("Per the Store Information, no.", questions[1]) == ["contains 'store information'"]


def test_the_real_question_file_loads():
    questions = load_questions(__import__("pathlib").Path("quality/questions.json"))

    assert len(questions) == 24
    # Every expected document is a knowledge file (or an upload the question sets up)
    knowledge = {p.name for p in __import__("pathlib").Path("knowledge").glob("*.md")}
    for q in questions:
        if q["expected_document"] and not q.get("setup"):
            assert q["expected_document"] in knowledge, q["id"]
    assert all("store information" in q["must_not_contain"] for q in questions)
    assert all("**" in q["must_not_contain"] for q in questions)  # no Markdown in any reply


def test_answer_check_stops_before_any_request_if_the_upload_is_missing(monkeypatch, session_factory, capsys):
    from app.cli import quality

    monkeypatch.setattr(quality, "SessionLocal", session_factory)
    calls = []
    monkeypatch.setattr(quality, "embed_texts", lambda *a, **k: calls.append(a) or [])
    question = {"id": "u", "question": "?", "setup": "quality/x.txt", "expected_document": "x.txt"}

    assert quality.run_answer_check([question]) == 2
    assert calls == []  # no embedding request
    assert "quality/x.txt" in capsys.readouterr().err


def test_answer_check_goes_ahead_when_the_upload_is_present(monkeypatch, session_factory, add_document):
    from app.cli import quality
    from tests.conftest import vector

    add_document("x.txt", [("X > A", vector(d0=1.0))], source_type="upload")
    monkeypatch.setattr(quality, "SessionLocal", session_factory)
    question = {"id": "u", "question": "?", "setup": "quality/x.txt", "expected_document": "x.txt"}

    assert quality.missing_setup_documents([question]) == []
