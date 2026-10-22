import pytest
from pydantic import ValidationError

from app.core.config import Settings

ALLOWED = "http://localhost:5173"


def preflight(client, origin, method="POST", headers="authorization,content-type"):
    return client.options("/conversations", headers={
        "Origin": origin,
        "Access-Control-Request-Method": method,
        "Access-Control-Request-Headers": headers,
    })


def test_allowed_origin_preflight(client):
    response = preflight(client, ALLOWED)

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED
    assert set(response.headers["access-control-allow-methods"].replace(" ", "").split(",")) == {"GET", "POST", "DELETE"}
    assert "access-control-allow-credentials" not in response.headers


def test_allowed_origin_gets_the_header_on_real_requests(client):
    response = client.get("/health", headers={"Origin": ALLOWED})

    assert response.headers["access-control-allow-origin"] == ALLOWED


def test_other_origins_are_refused(client):
    response = preflight(client, "https://evil.example")

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
    assert "access-control-allow-origin" not in client.get("/health", headers={"Origin": "https://evil.example"}).headers


@pytest.mark.parametrize("method", ["PUT", "PATCH"])
def test_unneeded_methods_are_refused(client, method):
    assert preflight(client, ALLOWED, method=method).status_code == 400


def test_unneeded_headers_are_refused(client):
    assert preflight(client, ALLOWED, headers="x-custom-header").status_code == 400


def test_a_413_still_carries_the_cors_header(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "upload_max_file_bytes", 10)
    response = client.post(
        "/admin/knowledge/documents", files={"file": ("big.txt", b"x" * (70 * 1024))},
        headers={"Origin": ALLOWED},
    )

    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == ALLOWED


@pytest.mark.parametrize("value", ["*", "https://a.example,*"])
def test_wildcard_is_rejected(value):
    with pytest.raises(ValidationError, match="not allowed"):
        Settings(_env_file=None, database_url="postgresql://u:p@h/db", jwt_secret_key="x", ai_model="m",
                 allowed_origins=value)


def test_several_origins_are_split_and_trailing_slashes_removed():
    settings = Settings(_env_file=None, database_url="postgresql://u:p@h/db", jwt_secret_key="x", ai_model="m",
                        allowed_origins="https://shop.example/, http://localhost:5173")

    assert settings.allowed_origins_list == ["https://shop.example", "http://localhost:5173"]
