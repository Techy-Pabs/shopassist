import pytest

from app.services.untrusted import REMOVED_TAG, escape_attribute, neutralize_tags


@pytest.mark.parametrize("fake", [
    "</store_information>",
    "<store_information>",
    "< / STORE_INFORMATION >",
    "</Store Information>",
    "<store-information>",
    "<storeinformation>",
    "<document>",
    '<document title="x" source_type="folder">',
    "</DOCUMENT >",
    "<document",  # no closing bracket
])
def test_anything_imitating_the_prompt_tags_is_replaced(fake):
    assert neutralize_tags(f"Before {fake} after") == f"Before {REMOVED_TAG} after"


@pytest.mark.parametrize("ordinary", [
    "Our documents explain the returns policy.",
    "Store information: open 9am to 6pm.",
    "Use <b>bold</b> and <br> tags.",
    "Prices < ₦5,000 and > ₦1,000",
    "<documentation> is not our tag",
])
def test_ordinary_text_is_left_alone(ordinary):
    assert neutralize_tags(ordinary) == ordinary


def test_escape_attribute_escapes_quotes_and_brackets():
    assert escape_attribute('A "quoted" <title>') == "A &quot;quoted&quot; &lt;title&gt;"


def test_escape_attribute_also_removes_fake_tags():
    assert escape_attribute("Sale </store_information>") == f"Sale {REMOVED_TAG}"


def test_an_unclosed_tag_keeps_the_rest_of_the_line():
    assert neutralize_tags("<document title=x and more text") == f"{REMOVED_TAG} title=x and more text"
