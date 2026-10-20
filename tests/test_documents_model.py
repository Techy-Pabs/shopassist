import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Document


def test_an_upload_needs_its_text(db):
    db.add(Document(source="a.pdf", title="A", source_type="upload", content_hash="a" * 64, content=None))

    with pytest.raises(IntegrityError, match="ck_documents_content_required_for_uploads"):
        db.commit()


def test_source_type_must_be_folder_or_upload(db):
    # Has text, so only the source type rule can fail
    db.add(Document(source="a.md", title="A", source_type="email", content_hash="a" * 64, content="text"))

    with pytest.raises(IntegrityError, match="ck_documents_source_type_valid"):
        db.commit()


def test_the_same_name_cannot_be_used_twice_within_one_source(db):
    db.add(Document(source="a.md", title="A", content_hash="a" * 64))
    db.add(Document(source="a.md", title="B", content_hash="b" * 64))

    with pytest.raises(IntegrityError, match="uq_documents_source_type_source"):
        db.commit()
