"""add source type and content to documents

Revision ID: 5570152f86fa
Revises: a641b83f43d2
Create Date: 2026-10-20 14:32:47.835436

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5570152f86fa'
down_revision: Union[str, Sequence[str], None] = 'a641b83f43d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. New columns. NOT NULL with a server default: every existing document
    #    gets source_type 'folder' as the column is added. content starts
    #    empty for them; the next ingestion stores it without re-embedding.
    op.add_column('documents', sa.Column('source_type', sa.String(length=20), server_default='folder', nullable=False))
    op.add_column('documents', sa.Column('content', sa.Text(), nullable=True))
    op.add_column('documents', sa.Column('uploaded_by', sa.Integer(), nullable=True))
    op.add_column('documents', sa.Column('original_filename', sa.String(length=255), nullable=True))
    op.add_column('documents', sa.Column('size_bytes', sa.Integer(), nullable=True))
    op.create_foreign_key(op.f('fk_documents_uploaded_by_users'), 'documents', 'users', ['uploaded_by'], ['id'], ondelete='SET NULL')

    # 2. Swap the unique rule. The new one is created first (safe: every row
    #    is 'folder' and sources are already unique), then the old one is
    #    dropped, so source is never left without a unique rule.
    op.create_unique_constraint(op.f('uq_documents_source_type_source'), 'documents', ['source_type', 'source'])
    op.drop_constraint(op.f('uq_documents_source'), 'documents', type_='unique')

    # 3. CHECK constraints, added by hand: autogenerate doesn't detect them
    #    on existing tables. Both hold for every existing row.
    op.create_check_constraint(op.f('ck_documents_source_type_valid'), 'documents', "source_type IN ('folder', 'upload')")
    op.create_check_constraint(
        op.f('ck_documents_content_required_for_uploads'), 'documents', "source_type = 'folder' OR content IS NOT NULL"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Refuse rather than silently delete uploads: without source_type they
    # couldn't be told apart from folder files, and their names could clash.
    uploads = op.get_bind().scalar(sa.text("SELECT count(*) FROM documents WHERE source_type = 'upload'"))
    if uploads:
        raise RuntimeError(
            f"{uploads} uploaded document(s) exist. Delete them through the admin API before downgrading."
        )

    op.drop_constraint(op.f('ck_documents_content_required_for_uploads'), 'documents', type_='check')
    op.drop_constraint(op.f('ck_documents_source_type_valid'), 'documents', type_='check')
    # Old rule back first, then the new one dropped
    op.create_unique_constraint(op.f('uq_documents_source'), 'documents', ['source'])
    op.drop_constraint(op.f('uq_documents_source_type_source'), 'documents', type_='unique')
    op.drop_constraint(op.f('fk_documents_uploaded_by_users'), 'documents', type_='foreignkey')
    op.drop_column('documents', 'size_bytes')
    op.drop_column('documents', 'original_filename')
    op.drop_column('documents', 'uploaded_by')
    op.drop_column('documents', 'content')
    op.drop_column('documents', 'source_type')
