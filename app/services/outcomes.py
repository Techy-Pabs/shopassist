"""What became of a reply ("answered" or "no_info"), and which documents it used.

The outcome is a heuristic: a good guess, not a certainty. The prompt asks
the assistant to begin with NO_INFO_PHRASE when it can't answer, and a model
may occasionally word a refusal differently. We don't ask the model for a
hidden tag instead: a customer could trick it into writing the tag, and free
models follow formatting instructions unreliably.
"""
from dataclasses import dataclass

from app.models.message import OUTCOME_ANSWERED, OUTCOME_NO_INFO
from app.services.prompts import NO_INFO_PHRASE
from app.services.retrieval import RetrievedChunk

_PHRASE = NO_INFO_PHRASE.casefold()


def _normalised(text: str) -> str:
    # Models often write a curly apostrophe ("don’t"); compare without case
    return text.replace("’", "'").casefold()


def detect_outcome(reply: str, store_information: list[RetrievedChunk]) -> str:
    """"no_info" if the reply begins with the phrase (ignoring case and leading
    spaces), or if retrieval found nothing relevant and the phrase appears
    anywhere; otherwise "answered"."""
    text = _normalised(reply).lstrip()
    if text.startswith(_PHRASE):
        return OUTCOME_NO_INFO
    # Chunks with a similarity passed the cut-off; always included ones have None
    found_relevant = any(c.similarity is not None for c in store_information)
    if not found_relevant and _PHRASE in text:
        return OUTCOME_NO_INFO
    return OUTCOME_ANSWERED


@dataclass
class Source:
    document_id: int | None
    document_name: str
    # The best similarity among the document's chunks; None if it is always included
    similarity: float | None


def sources_for(store_information: list[RetrievedChunk]) -> list[Source]:
    """One entry per document that was in the prompt, in prompt order."""
    sources: dict[tuple, Source] = {}
    for chunk in store_information:
        key = (chunk.document_id, chunk.source)
        source = sources.get(key)
        if source is None:
            sources[key] = Source(chunk.document_id, chunk.source, chunk.similarity)
        elif chunk.similarity is not None and (source.similarity is None or chunk.similarity > source.similarity):
            source.similarity = chunk.similarity
    return list(sources.values())
