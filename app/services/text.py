def shorten(text: str, limit: int) -> str:
    """text on one line, cut to at most limit characters at a word boundary.

    "…" is added only when something was cut. A single word longer than the
    limit is cut mid word.
    """
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[:limit]
    if " " in cut and text[limit] != " ":
        cut = cut[: cut.rindex(" ")]
    return cut.rstrip(" ,.;:!?-") + "…"
