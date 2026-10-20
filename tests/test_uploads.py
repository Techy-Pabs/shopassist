import io
import zipfile

import pytest
from sqlalchemy import select, update

from app.core.config import settings
from app.models import Chunk, Document, User
from app.models.user import ROLE_ADMIN
from app.services import ai
from app.services.extraction import clean_filename
from app.services.ingestion import content_hash
from tests.conftest import vector
from tests.files import make_docx, make_encrypted_pdf, make_pdf

URL = "/admin/knowledge/documents"


@pytest.fixture
def admin(auth_headers, db):
    headers = auth_headers("admin@example.com")
    db.execute(update(User).where(User.email == "admin@example.com").values(role=ROLE_ADMIN))
    db.commit()
    return headers


@pytest.fixture
def embeddings(monkeypatch):
    """Fake embeddings that work (conftest's default fails, like an outage)."""
    calls = []

    def fake(texts, mode):
        calls.append((list(texts), mode))
        return [vector(d0=1.0) for _ in texts]

    monkeypatch.setitem(ai._EMBEDDING_PROVIDERS, "openrouter", fake)
    return calls


def upload(client, headers, filename, data, title=None):
    form = {"title": title} if title is not None else {}
    return client.post(URL, files={"file": (filename, data)}, data=form, headers=headers)


def documents(db):
    db.expire_all()
    return db.scalars(select(Document)).all()


# --- Successful uploads, one per type ---

def test_txt_upload(client, admin, embeddings, db):
    response = upload(client, admin, "care.txt", b"Wash linen at 30 degrees.\n\nDo not tumble dry.")

    assert response.status_code == 201
    body = response.json()
    assert body["source_type"] == "upload"
    assert body["title"] == "care"  # the file name without its extension
    assert body["chunk_count"] == 1
    assert body["embedding_requests"] == 1
    assert "hashed_password" not in response.text
    [document] = documents(db)
    assert document.content == "Wash linen at 30 degrees.\n\nDo not tumble dry."
    assert document.uploaded_by is not None


def test_md_upload_uses_its_sections(client, admin, embeddings, db):
    markdown = "# Guide\n\n## Washing\n\nWash at 30.\n\n## Drying\n\nDry flat."

    response = upload(client, admin, "guide.md", markdown.encode(), title="Care guide")

    assert response.status_code == 201
    labels = [c.content.split("\n")[0] for c in db.scalars(select(Chunk).order_by(Chunk.chunk_index))]
    assert labels == ["Care guide > Washing", "Care guide > Drying"]


def test_pdf_upload(client, admin, embeddings, db):
    response = upload(client, admin, "faq.pdf", make_pdf(["Gift wrapping is available.", "Second page text."]))

    assert response.status_code == 201
    text = documents(db)[0].content
    assert "Gift wrapping is available." in text and "Second page text." in text


def test_docx_headings_become_sections(client, admin, embeddings, db):
    data = make_docx([
        ("Heading 1", "Washing"), ("Normal", "Wash at 30."),
        ("Heading 2", "Wool"), ("Normal", "Hand wash only."),
    ])

    response = upload(client, admin, "care.docx", data, title="Care")

    assert response.status_code == 201
    labels = [c.content.split("\n")[0] for c in db.scalars(select(Chunk).order_by(Chunk.chunk_index))]
    assert labels == ["Care > Washing", "Care > Wool"]


def test_a_utf8_bom_is_accepted(client, admin, embeddings):
    assert upload(client, admin, "bom.txt", "\ufeffHello there".encode("utf-8")).status_code == 201


def test_one_embedding_request_for_all_chunks(client, admin, embeddings):
    text = "\n\n".join(f"## Part {i}\n\nText {i}." for i in range(10))

    upload(client, admin, "parts.md", text.encode())

    assert len(embeddings) == 1 and len(embeddings[0][0]) == 10
    assert embeddings[0][1] == "document"


def test_upload_and_folder_file_can_share_a_name(client, admin, embeddings, add_document):
    add_document("returns.md", [("Returns > A", vector(d0=1.0))])

    assert upload(client, admin, "returns.md", b"Different returns text.").status_code == 201


def test_list_shows_upload_fields(client, admin, embeddings):
    upload(client, admin, "care.txt", b"Wash at 30.")

    [item] = client.get(URL, headers=admin).json()["items"]

    assert item["source_type"] == "upload"
    assert item["original_filename"] == "care.txt"
    assert item["uploaded_by"] is not None


# --- Rejections ---

@pytest.mark.parametrize("filename, data", [
    ("fake.pdf", b"just some text, not a PDF"),
    ("fake.docx", b"just some text, not a Word file"),
    ("fake.docx", (lambda: (lambda b: (zipfile.ZipFile(b, "w").writestr("other.txt", "x"), b.getvalue())[1])(io.BytesIO()))()),
    ("binary.txt", b"text\x00with a zero byte"),
    ("latin1.txt", "café crème".encode("latin-1")),
    ("program.exe", b"MZ..."),
])
def test_wrong_contents_or_type_get_415(client, admin, embeddings, db, filename, data):
    response = upload(client, admin, filename, data)

    assert response.status_code == 415
    assert documents(db) == []
    assert embeddings == []


def test_non_utf8_message_says_how_to_fix_it(client, admin, embeddings):
    response = upload(client, admin, "latin1.txt", "café".encode("latin-1"))

    assert "UTF-8" in response.json()["detail"]


def test_file_over_the_size_limit_gets_413(client, admin, embeddings, monkeypatch):
    monkeypatch.setattr(settings, "upload_max_file_bytes", 100)

    response = upload(client, admin, "big.txt", b"x" * 101)

    assert response.status_code == 413


def test_declared_size_over_the_limit_is_rejected_before_reading(client, admin, monkeypatch):
    monkeypatch.setattr(settings, "upload_max_file_bytes", 10)
    big = b"x" * (70 * 1024)  # over the limit plus the allowance for the form wrapping

    response = upload(client, admin, "big.txt", big)

    assert response.status_code == 413


@pytest.mark.parametrize("setting, value, filename, data", [
    ("upload_max_pdf_pages", 1, "two.pdf", make_pdf(["Page one.", "Page two."])),
    ("upload_max_chars", 10, "long.txt", b"This text is longer than ten characters."),
    ("upload_max_chunks", 2, "many.md", "\n\n".join(f"## S{i}\n\nT{i}." for i in range(3)).encode()),
    ("upload_max_docx_uncompressed_bytes", 1000, "big.docx", make_docx([("Normal", "Hello")])),
])
def test_each_limit_gets_413(client, admin, embeddings, db, monkeypatch, setting, value, filename, data):
    monkeypatch.setattr(settings, setting, value)

    response = upload(client, admin, filename, data)

    assert response.status_code == 413
    assert "Split the document" in response.json()["detail"]
    assert documents(db) == [] and embeddings == []


@pytest.mark.parametrize("filename, data", [
    ("scanned.pdf", make_pdf([None, None])),
    ("empty.txt", b"   \n\n  "),
    ("empty.docx", make_docx([("Normal", "")])),
])
def test_no_text_gets_422(client, admin, embeddings, filename, data):
    response = upload(client, admin, filename, data)

    assert response.status_code == 422
    assert "Scanned documents" in response.json()["detail"]


def test_encrypted_pdf_gets_422(client, admin, embeddings):
    response = upload(client, admin, "locked.pdf", make_encrypted_pdf())

    assert response.status_code == 422
    assert "password" in response.json()["detail"]


def test_duplicate_content_gets_409_with_the_existing_id(client, admin, embeddings):
    first = upload(client, admin, "care.txt", b"Wash at 30.").json()

    response = upload(client, admin, "copy-of-care.txt", b"Wash at 30.")

    assert response.status_code == 409
    assert response.json()["document_id"] == first["id"]


def test_duplicate_of_a_folder_document_gets_409(client, admin, embeddings, db):
    text = "# Contact\n\nEmail us."
    folder = Document(source="contact.md", title="Contact", content_hash=content_hash(text), content=text)
    db.add(folder)
    db.commit()

    response = upload(client, admin, "contact-copy.md", text.encode())

    assert response.status_code == 409
    assert response.json()["document_id"] == folder.id


def test_same_name_different_content_gets_409(client, admin, embeddings):
    first = upload(client, admin, "care.txt", b"Wash at 30.").json()

    response = upload(client, admin, "care.txt", b"Wash at 40.")

    assert response.status_code == 409
    assert "Delete it first" in response.json()["detail"]
    assert response.json()["document_id"] == first["id"]


def test_embedding_failure_saves_nothing(client, admin, db):
    # No "embeddings" fixture: conftest makes every embedding call fail
    response = upload(client, admin, "care.txt", b"Wash at 30.")

    assert response.status_code == 502
    assert "Nothing was saved" in response.json()["detail"]
    assert documents(db) == []
    assert db.scalar(select(Chunk.id)) is None


def test_title_over_200_characters_gets_422(client, admin, embeddings):
    assert upload(client, admin, "care.txt", b"Wash at 30.", title="x" * 201).status_code == 422


# --- Access ---

def test_no_token_gets_401(client):
    assert client.post(URL, files={"file": ("a.txt", b"Hello")}).status_code == 401


def test_customer_gets_403(client, auth_headers):
    response = client.post(URL, files={"file": ("a.txt", b"Hello")}, headers=auth_headers("c@example.com"))

    assert response.status_code == 403


# --- File names ---

@pytest.mark.parametrize("raw, cleaned", [
    ("../../etc/passwd.txt", "passwd.txt"),
    ("C:\\Users\\me\\Care Guide.docx", "Care Guide.docx"),
    ("bad\x00name\n.md", "badname.md"),
    ("", "upload"),
    ("...", "upload"),
])
def test_file_names_are_cleaned(raw, cleaned):
    assert clean_filename(raw) == cleaned


def test_stored_name_never_contains_a_path(client, admin, embeddings, db):
    upload(client, admin, "../../secret/care.txt", b"Wash at 30.")

    assert documents(db)[0].source == "care.txt"
