"""Process an admin's knowledge upload: extract, check, chunk, embed, save."""

import logging
import math
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Chunk, Document, User
from app.models.document import SOURCE_UPLOAD
from app.services.ai import EMBEDDING_BATCH_SIZE, embed_texts
from app.services.chunking import chunk_markdown
from app.services.extraction import UploadError, clean_filename, extract_text, too_large
from app.services.ingestion import content_hash

logger = logging.getLogger(__name__)


@dataclass
class UploadResult:
    document: Document
    chunk_count: int
    embedding_requests: int


def read_limited(stream: BinaryIO, limit: int) -> bytes:
    """Read at most limit bytes, raising 413 as soon as there are more.

    Reads in pieces, so an oversized upload is never held in memory whole.
    """
    pieces, size = [], 0
    while piece := stream.read(1024 * 1024):
        size += len(piece)
        if size > limit:
            raise too_large(f"This file is over the {limit // (1024 * 1024)} MB upload limit.")
        pieces.append(piece)
    return b"".join(pieces)


def conflict(message: str, document_id: int) -> UploadError:
    error = UploadError(409, message)
    error.document_id = document_id
    return error


def process_upload(
    db: Session, admin: User, filename: str | None, data: bytes, title: str | None, embed=embed_texts
) -> UploadResult:
    """Raises UploadError (415, 413, 422, 409), or AIServiceError if embedding fails.

    Nothing is saved unless every step succeeds.
    """
    name = clean_filename(filename)
    text = extract_text(name, data)
    title = (title or "").strip() or PurePosixPath(name).stem

    new_hash = content_hash(text)
    duplicate = db.scalar(select(Document).where(Document.content_hash == new_hash).limit(1))
    if duplicate:
        raise conflict(
            f"This content is already in the knowledge base as document {duplicate.id} ({duplicate.source}).",
            duplicate.id,
        )
    same_name = db.scalar(
        select(Document).where(Document.source_type == SOURCE_UPLOAD, Document.source == name)
    )
    if same_name:
        raise conflict(
            f"An uploaded document named {name} already exists (document {same_name.id}). Delete it first.",
            same_name.id,
        )

    chunk_texts = [c.content for c in chunk_markdown(text, title)]
    if not chunk_texts:
        raise UploadError(422, "No text could be found in this file to add to the knowledge base.")
    if len(chunk_texts) > settings.upload_max_chunks:
        raise too_large(f"This file makes {len(chunk_texts)} sections; the limit is {settings.upload_max_chunks}.")

    vectors = embed(chunk_texts, "document")  # AIServiceError propagates: nothing saved yet

    document = Document(
        source_type=SOURCE_UPLOAD, source=name, original_filename=name, title=title,
        content=text, content_hash=new_hash, uploaded_by=admin.id, size_bytes=len(data),
    )
    db.add(document)
    try:
        db.flush()
        db.add_all(
            Chunk(
                document_id=document.id, chunk_index=i, content=chunk_text,
                embedding=vector, embedding_model=settings.embedding_model,
            )
            for i, (chunk_text, vector) in enumerate(zip(chunk_texts, vectors))
        )
        db.commit()  # the document and all its chunks, or nothing
    except IntegrityError:
        db.rollback()  # another upload with the same name got there first
        raise UploadError(409, f"An uploaded document named {name} already exists. Delete it first.")
    db.refresh(document)

    # Ids and the file name only, never the content
    logger.info(
        "Knowledge upload: admin_id=%s document_id=%s file=%s chunks=%d",
        admin.id, document.id, name, len(chunk_texts),
    )
    return UploadResult(document, len(chunk_texts), math.ceil(len(chunk_texts) / EMBEDDING_BATCH_SIZE))
