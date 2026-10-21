"""neutralize prompt tags in uploaded documents

Revision ID: 3ed83eaa00b2
Revises: 5570152f86fa
Create Date: 2026-10-20 15:20:41.000000

Uploads stored before tag neutralizing existed could contain text that
imitates the prompt's <store_information> or <document> tags. This replaces
any such text in uploaded documents' titles, stored text and chunks, and
updates their content hash. Folder documents are left alone: their text is
rewritten from the trusted knowledge/ files on every start.

Embeddings are not recomputed: replacing a tag with "[removed tag]" barely
changes a chunk's meaning, and re-embedding would use the daily quota.
"""
import hashlib
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3ed83eaa00b2'
down_revision: Union[str, Sequence[str], None] = '5570152f86fa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# A frozen copy of app/services/untrusted.py at the time of this migration,
# so later changes to the app can't change what this migration does
_PROMPT_TAG = re.compile(r"<\s*/?\s*(?:store[\s_-]*information|document)\b(?:[^<>\n]*>)?", re.IGNORECASE)


def _neutralize(text):
    return _PROMPT_TAG.sub("[removed tag]", text) if text else text


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    uploads = conn.execute(
        sa.text("SELECT id, title, content FROM documents WHERE source_type = 'upload'")
    ).all()
    changed = 0
    for document_id, title, content in uploads:
        new_title, new_content = _neutralize(title), _neutralize(content)
        if (new_title, new_content) != (title, content):
            changed += 1
            conn.execute(
                sa.text("UPDATE documents SET title = :title, content = :content, content_hash = :hash WHERE id = :id"),
                {"title": new_title, "content": new_content, "id": document_id,
                 "hash": hashlib.sha256(new_content.encode("utf-8")).hexdigest()},
            )
        chunks = conn.execute(
            sa.text("SELECT id, content FROM chunks WHERE document_id = :id"), {"id": document_id}
        ).all()
        for chunk_id, chunk_content in chunks:
            new_chunk = _neutralize(chunk_content)
            if new_chunk != chunk_content:
                conn.execute(
                    sa.text("UPDATE chunks SET content = :content WHERE id = :id"),
                    {"content": new_chunk, "id": chunk_id},
                )
    print(f"Checked {len(uploads)} uploaded document(s); neutralized tags in {changed}.")


def downgrade() -> None:
    """Downgrade schema."""
    # Nothing to undo: removed tags are not put back
    pass
