from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.chunk import Chunk


SOURCE_FOLDER = "folder"  # a file in knowledge/, managed by ingestion
SOURCE_UPLOAD = "upload"  # uploaded by an admin, managed through the API


class Document(Base):
    """One knowledge base document: a file in knowledge/, or an upload."""

    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint("source_type IN ('folder', 'upload')", name="source_type_valid"),
        # Uploads have no file to read again, so their text must be stored
        CheckConstraint(
            "source_type = 'folder' OR content IS NOT NULL", name="content_required_for_uploads"
        ),
        # An upload named "returns.md" never collides with the folder file
        UniqueConstraint("source_type", "source", name="uq_documents_source_type_source"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    source_type: Mapped[str] = mapped_column(
        String(20), default=SOURCE_FOLDER, server_default=SOURCE_FOLDER
    )
    # The file name; ingestion uses it to match folder files to documents
    source: Mapped[str] = mapped_column(String(255))
    # SHA-256 of the document's text (UTF-8), so unchanged documents can be skipped
    content_hash: Mapped[str] = mapped_column(String(64))
    # The full text, so any document can be re-embedded without its file
    content: Mapped[str | None] = mapped_column(Text)
    # Uploads only: who uploaded it, and the original file's name and size
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    original_filename: Mapped[str | None] = mapped_column(String(255))
    size_bytes: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Deleting a document deletes its chunks (also ON DELETE CASCADE in the database)
    chunks: Mapped[list["Chunk"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Chunk.chunk_index",
    )
