# Import every model here so they all register on Base.metadata.
# Alembic imports this package to see the full set of tables.
from app.models.chunk import Chunk
from app.models.conversation import Conversation
from app.models.document import Document
from app.models.message import Message
from app.models.message_source import MessageSource
from app.models.user import User

__all__ = ["User", "Conversation", "Message", "MessageSource", "Document", "Chunk"]
