from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.message import Message


class MessageSource(Base):
    """A knowledge document that was in the prompt when a reply was written.

    One row per document, not per chunk. If the document is deleted later,
    document_id becomes NULL and document_name still says what it was.
    """

    __tablename__ = "message_sources"
    __table_args__ = (
        UniqueConstraint("message_id", "document_id", name="uq_message_sources_message_id_document_id"),
        # Cosine similarity; NULL for documents included in every prompt
        CheckConstraint("similarity IS NULL OR (similarity >= -1 AND similarity <= 1)", name="similarity_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Indexed by the unique (message_id, document_id) constraint, which starts with it
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"))
    document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), index=True)
    # The document's file name when the reply was written (a snapshot)
    document_name: Mapped[str] = mapped_column(String(255))
    # The best similarity among that document's chunks in the prompt
    similarity: Mapped[float | None] = mapped_column(Float)

    message: Mapped["Message"] = relationship(back_populates="sources")
