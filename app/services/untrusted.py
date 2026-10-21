"""Keep text from the knowledge base from posing as part of the prompt.

The system prompt marks store information with <store_information> and
<document ...> tags. Uploaded text is untrusted: if it could contain those
tags, a document could "close" its section and write its own instructions.
"""

import html
import re

REMOVED_TAG = "[removed tag]"

# Anything that looks like one of the prompt's tags, opening or closing,
# whatever the case or spacing: </store_information>, < / STORE information >,
# <store-information>, <document title="x">, </document>. A "<document" with no
# closing ">" on its line loses only those characters, never the text after it.
# Ordinary text like "documents" or "<br>" is untouched.
_PROMPT_TAG = re.compile(
    r"<\s*/?\s*(?:store[\s_-]*information|document)\b(?:[^<>\n]*>)?",
    re.IGNORECASE,
)


def neutralize_tags(text: str) -> str:
    """Replace anything imitating the prompt's tags with "[removed tag]"."""
    return _PROMPT_TAG.sub(REMOVED_TAG, text)


def escape_attribute(value: str) -> str:
    """A title made safe to place inside a tag attribute: quotes and angle brackets escaped."""
    return html.escape(neutralize_tags(value), quote=True)
