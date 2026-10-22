import pytest

from app.services.text import shorten


@pytest.mark.parametrize("text, limit, expected", [
    ("Short question", 60, "Short question"),
    ("exactly ten", 11, "exactly ten"),
    ("How long does delivery to Abuja take, and how much does it cost?", 30, "How long does delivery to…"),
    ("Can I return earrings, please?", 22, "Can I return earrings…"),  # trailing comma dropped
    ("one two three", 7, "one two…"),  # the cut lands exactly before a space
    ("Supercalifragilisticexpialidocious", 10, "Supercalif…"),  # one long word
    ("Line one\n\nLine   two", 60, "Line one Line two"),  # whitespace collapsed
])
def test_shorten(text, limit, expected):
    assert shorten(text, limit) == expected


def test_shortened_text_never_exceeds_limit_plus_ellipsis():
    text = "word " * 50
    assert len(shorten(text, 60)) <= 61
