import pytest
from fastapi.testclient import TestClient

from app import email as email_module
from app.main import app
from app.rate_limit import RateLimiter

VALID = {
    "name": "Ivan",
    "email": "ivan@example.com",
    "message": "Hello, a project idea.",
    "locale": "ru",
}


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    app.state.limiter = RateLimiter(5, 60)
    sent = []
    monkeypatch.setattr(email_module, "send_lead_email", sent.append)
    return sent


@pytest.fixture
def sent(_reset):
    return _reset


@pytest.fixture
def client():
    return TestClient(app)


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["cache-control"] == "no-store"


def test_success(client, sent):
    r = client.post("/api/lead", json={**VALID, "website": "", "extra": 1})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert len(sent) == 1 and sent[0].locale == "ru"


def test_default_locale(client, sent):
    body = {k: v for k, v in VALID.items() if k != "locale"}
    assert client.post("/api/lead", json=body).status_code == 200
    assert sent[0].locale == "en"


def post_fields(client, **override):
    r = client.post("/api/lead", json={**VALID, **override})
    assert r.status_code == 400
    assert r.json()["error"] == "validation_error"
    return r.json()["fields"]


@pytest.mark.parametrize(
    ("override", "expected"),
    [
        ({"name": ""}, {"name": "required"}),
        ({"name": "   "}, {"name": "required"}),
        ({"name": None}, {"name": "required"}),
        ({"name": 5}, {"name": "invalid_format"}),
        ({"name": "a" * 101}, {"name": "too_long"}),
        ({"email": "nope"}, {"email": "invalid_format"}),
        ({"email": "a b@example.com"}, {"email": "invalid_format"}),
        ({"email": ""}, {"email": "required"}),
        ({"email": "a" * 250 + "@x.uz"}, {"email": "too_long"}),
        ({"message": ""}, {"message": "required"}),
        ({"message": "short"}, {"message": "too_short"}),
        ({"message": "a" * 2001}, {"message": "too_long"}),
        ({"locale": "de"}, {"locale": "invalid_value"}),
        ({"locale": 1}, {"locale": "invalid_value"}),
    ],
)
def test_field_errors(client, override, expected):
    assert post_fields(client, **override) == expected


def test_missing_fields(client):
    r = client.post("/api/lead", json={})
    assert r.json()["fields"] == {"name": "required", "email": "required", "message": "required"}


@pytest.mark.parametrize("raw", ["{not json", "[]", "null", '"str"', ""])
def test_bad_request(client, raw):
    r = client.post("/api/lead", content=raw, headers={"content-type": "application/json"})
    assert r.status_code == 400
    assert r.json() == {"error": "bad_request"}


def test_honeypot(client, sent):
    r = client.post("/api/lead", json={"website": "http://spam", "name": ""})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert sent == []


def test_rate_limit_sixth(client, sent):
    for _ in range(5):
        assert client.post("/api/lead", json=VALID).status_code == 200
    r = client.post("/api/lead", json=VALID)
    assert r.status_code == 429
    assert r.json() == {"error": "rate_limited"}
    assert len(sent) == 5


def test_rate_limit_uses_rightmost_xff(client):
    for _ in range(5):
        client.post("/api/lead", json=VALID, headers={"x-forwarded-for": "1.1.1.1, 9.9.9.9"})
    r = client.post("/api/lead", json=VALID, headers={"x-forwarded-for": "2.2.2.2, 9.9.9.9"})
    assert r.status_code == 429
    r = client.post("/api/lead", json=VALID, headers={"x-forwarded-for": "9.9.9.9, 3.3.3.3"})
    assert r.status_code == 200


def test_send_failure(client, monkeypatch):
    def boom(lead):
        raise RuntimeError("x")

    monkeypatch.setattr(email_module, "send_lead_email", boom)
    r = client.post("/api/lead", json=VALID)
    assert r.status_code == 500
    assert r.json() == {"error": "internal_error"}


def test_cors(client):
    r = client.options(
        "/api/lead",
        headers={
            "origin": "https://krunai.uz",
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type",
        },
    )
    assert r.headers["access-control-allow-origin"] == "https://krunai.uz"
