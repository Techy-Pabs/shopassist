import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models import Chunk, Document
from app.services.ai import AIServiceError
from app.services.ingestion import ingest_knowledge
from tests.conftest import vector


class FakeEmbedder:
    """Returns a fake vector per text and records each call (no network)."""

    def __init__(self):
        self.calls = []
        self.fail = False

    def __call__(self, texts, mode):
        self.calls.append((list(texts), mode))
        if self.fail:
            raise AIServiceError("simulated outage")
        return [vector(d0=1.0) for _ in texts]


@pytest.fixture
def knowledge(tmp_path):
    (tmp_path / "returns.md").write_text("# Returns\n\n## Window\n\n14 days.\n\n## Refunds\n\n5 to 7 days.\n")
    (tmp_path / "contact.md").write_text("# Contact\n\n## Email\n\nsupport@example.test\n")
    return tmp_path


@pytest.fixture
def embedder():
    return FakeEmbedder()


def sources(db):
    db.expire_all()
    return sorted(db.scalars(select(Document.source)))


def test_first_run_adds_every_file_in_one_embedding_call(db, knowledge, embedder):
    summary = ingest_knowledge(knowledge, db, embed=embedder)

    assert sorted(summary.added) == ["contact.md", "returns.md"]
    assert summary.chunks_per_file == {"contact.md": 1, "returns.md": 2}
    assert len(embedder.calls) == 1
    assert embedder.calls[0][1] == "document"
    assert len(embedder.calls[0][0]) == 3
    assert db.scalar(select(Chunk).where(Chunk.chunk_index == 0)).embedding_model == settings.embedding_model


def test_unchanged_files_are_skipped(db, knowledge, embedder):
    ingest_knowledge(knowledge, db, embed=embedder)
    embedder.calls.clear()

    summary = ingest_knowledge(knowledge, db, embed=embedder)

    assert sorted(summary.unchanged) == ["contact.md", "returns.md"]
    assert summary.texts_embedded == 0
    assert embedder.calls == []


def test_only_changed_files_are_re_embedded(db, knowledge, embedder):
    ingest_knowledge(knowledge, db, embed=embedder)
    embedder.calls.clear()
    (knowledge / "returns.md").write_text("# Returns\n\n## Window\n\n30 days.\n")

    summary = ingest_knowledge(knowledge, db, embed=embedder)

    assert summary.updated == ["returns.md"]
    assert summary.unchanged == ["contact.md"]
    assert embedder.calls == [(["Returns > Window\n\n30 days."], "document")]
    db.expire_all()
    contents = db.scalars(select(Chunk.content).join(Document).where(Document.source == "returns.md")).all()
    assert contents == ["Returns > Window\n\n30 days."]  # old chunks replaced


def test_deleted_files_are_removed_with_their_chunks(db, knowledge, embedder):
    ingest_knowledge(knowledge, db, embed=embedder)
    (knowledge / "contact.md").unlink()

    summary = ingest_knowledge(knowledge, db, embed=embedder)

    assert summary.removed == ["contact.md"]
    assert sources(db) == ["returns.md"]
    assert db.query(Chunk).count() == 2


def test_failed_embedding_saves_nothing_and_the_next_run_retries(db, knowledge, embedder):
    embedder.fail = True
    with pytest.raises(AIServiceError):
        ingest_knowledge(knowledge, db, embed=embedder)
    assert sources(db) == []

    embedder.fail = False
    summary = ingest_knowledge(knowledge, db, embed=embedder)

    assert sorted(summary.added) == ["contact.md", "returns.md"]


def test_reembed_all_re_embeds_unchanged_files(db, knowledge, embedder):
    ingest_knowledge(knowledge, db, embed=embedder)
    embedder.calls.clear()

    summary = ingest_knowledge(knowledge, db, embed=embedder, reembed_all=True)

    assert sorted(summary.updated) == ["contact.md", "returns.md"]
    assert len(embedder.calls) == 1 and len(embedder.calls[0][0]) == 3


def test_chunks_from_another_embedding_model_are_re_embedded(db, knowledge, embedder):
    ingest_knowledge(knowledge, db, embed=embedder)
    db.query(Chunk).update({Chunk.embedding_model: "some-old-model"})
    db.commit()

    summary = ingest_knowledge(knowledge, db, embed=embedder)

    assert sorted(summary.updated) == ["contact.md", "returns.md"]


# --- Folder documents vs uploads (Milestone 4) ---

from app.models.document import SOURCE_FOLDER, SOURCE_UPLOAD  # noqa: E402
from app.services.ingestion import content_hash  # noqa: E402


def add_upload(db, source="contact.md", text="# Uploaded\n\n## Part\n\nUploaded text.", model=None):
    document = Document(
        source=source, title="Uploaded", source_type=SOURCE_UPLOAD,
        content_hash=content_hash(text), content=text, original_filename=source,
    )
    db.add(document)
    db.flush()
    db.add(Chunk(
        document_id=document.id, chunk_index=0, content="Uploaded > Part\n\nUploaded text.",
        embedding=vector(d0=1.0), embedding_model=model or settings.embedding_model,
    ))
    db.commit()
    return document


def test_text_hash_equals_the_old_file_bytes_hash(knowledge):
    import hashlib

    raw = (knowledge / "returns.md").read_bytes()

    assert content_hash(raw.decode("utf-8")) == hashlib.sha256(raw).hexdigest()


def test_folder_documents_store_their_text(db, knowledge, embedder):
    ingest_knowledge(knowledge, db, embed=embedder)

    document = db.scalar(select(Document).where(Document.source == "returns.md"))
    assert document.source_type == SOURCE_FOLDER
    assert document.content == (knowledge / "returns.md").read_text()


def test_missing_text_is_stored_without_re_embedding(db, knowledge, embedder):
    ingest_knowledge(knowledge, db, embed=embedder)
    db.query(Document).update({Document.content: None})
    db.commit()
    embedder.calls.clear()

    summary = ingest_knowledge(knowledge, db, embed=embedder)

    assert sorted(summary.content_stored) == ["contact.md", "returns.md"]
    assert embedder.calls == []
    db.expire_all()
    assert all(d.content for d in db.scalars(select(Document)))


def test_startup_ingestion_never_touches_uploads(db, knowledge, embedder):
    ingest_knowledge(knowledge, db, embed=embedder)
    upload = add_upload(db, source="refund-faq.pdf")
    embedder.calls.clear()
    (knowledge / "contact.md").unlink()  # a folder file removed

    summary = ingest_knowledge(knowledge, db, embed=embedder)

    assert summary.removed == ["contact.md"]  # the folder document only
    assert summary.reembedded_uploads == []
    assert embedder.calls == []
    db.expire_all()
    assert db.get(Document, upload.id) is not None
    assert db.query(Chunk).filter_by(document_id=upload.id).count() == 1


def test_an_upload_can_share_a_folder_file_name(db, knowledge, embedder):
    add_upload(db, source="contact.md")

    summary = ingest_knowledge(knowledge, db, embed=embedder)

    assert sorted(summary.added) == ["contact.md", "returns.md"]
    db.expire_all()
    assert sorted(db.scalars(select(Document.source_type).where(Document.source == "contact.md"))) == [
        SOURCE_FOLDER, SOURCE_UPLOAD,
    ]


def test_reembed_all_re_embeds_uploads_from_their_stored_text(db, knowledge, embedder):
    ingest_knowledge(knowledge, db, embed=embedder)
    add_upload(db, source="refund-faq.pdf")
    embedder.calls.clear()

    summary = ingest_knowledge(knowledge, db, embed=embedder, reembed_all=True)

    assert summary.reembedded_uploads == ["refund-faq.pdf"]
    assert "Uploaded > Part\n\nUploaded text." in embedder.calls[0][0]
    assert len(embedder.calls) == 1  # folder files and the upload in one request


def test_uploads_with_chunks_from_another_model_are_re_embedded(db, knowledge, embedder):
    ingest_knowledge(knowledge, db, embed=embedder)
    add_upload(db, source="refund-faq.pdf", model="some-old-model")

    summary = ingest_knowledge(knowledge, db, embed=embedder)

    assert summary.reembedded_uploads == ["refund-faq.pdf"]
