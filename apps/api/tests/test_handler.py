import base64
import json
import logging
from unittest.mock import MagicMock

import pytest

from lead import email as email_module
from lead.handler import lambda_handler

VALID = {
    "name": "Ivan Petrov",
    "email": "ivan@example.com",
    "message": "Secret project idea",
    "lang": "ru",
    "website": "",
}


@pytest.fixture(autouse=True)
def ses(monkeypatch):
    monkeypatch.setenv("LEAD_RECIPIENT_EMAIL", "gulmira@krunai.uz")
    monkeypatch.setenv("LEAD_FROM_EMAIL", "noreply@krunai.uz")
    monkeypatch.delenv("LEAD_EMAIL_DRY_RUN", raising=False)
    client = MagicMock()
    monkeypatch.setattr(email_module, "_client", client)
    return client


def call(body, b64=False, raw=None):
    payload = raw if raw is not None else json.dumps(body)
    if b64:
        payload = base64.b64encode(payload.encode()).decode()
    event = {"body": payload, "isBase64Encoded": b64, "requestContext": {"requestId": "rid-1"}}
    res = lambda_handler(event, None)
    return res["statusCode"], json.loads(res["body"])


def test_success_sends_email(ses):
    assert call(VALID) == (200, {"ok": True})
    kw = ses.send_email.call_args.kwargs
    assert kw["FromEmailAddress"] == "noreply@krunai.uz"
    assert kw["Destination"] == {"ToAddresses": ["gulmira@krunai.uz"]}
    assert kw["ReplyToAddresses"] == ["ivan@example.com"]
    simple = kw["Content"]["Simple"]
    assert simple["Subject"]["Data"].startswith("[RU]")
    text = simple["Body"]["Text"]["Data"]
    assert "Ivan Petrov" in text and "ivan@example.com" in text
    assert "Secret project idea" in text and "UTC" in text


def test_base64_body(ses):
    assert call(VALID, b64=True) == (200, {"ok": True})
    assert ses.send_email.call_count == 1


def test_subject_en(ses):
    call({**VALID, "lang": "en"})
    assert ses.send_email.call_args.kwargs["Content"]["Simple"]["Subject"]["Data"].startswith(
        "[EN]"
    )


def test_honeypot(ses, caplog):
    with caplog.at_level(logging.INFO, logger="lead"):
        assert call({**VALID, "website": "http://spam"}) == (200, {"ok": True})
    ses.send_email.assert_not_called()
    assert "honeypot_triggered" in caplog.text
    assert "Ivan" not in caplog.text and "spam" not in caplog.text


@pytest.mark.parametrize("field", ["name", "email"])
@pytest.mark.parametrize("bad", ["a\r\nBcc: x@y.z", "a\nb", "a\rb"])
def test_crlf_rejected(ses, field, bad):
    value = bad if field == "name" else f"x{bad}@example.com"
    status, body = call({**VALID, field: value})
    assert status == 400
    assert body == {"error": "validation_error", "fields": {field: "invalid_format"}}
    ses.send_email.assert_not_called()


def test_message_too_long():
    status, body = call({**VALID, "message": "a" * 5001})
    assert (status, body["fields"]) == (400, {"message": "too_long"})
    assert call({**VALID, "message": "a" * 5000})[0] == 200


def test_required_and_invalid_values():
    status, body = call({"website": ""})
    assert status == 400
    assert body["fields"] == {
        "name": "required",
        "email": "required",
        "message": "required",
        "lang": "required",
    }
    assert call({**VALID, "lang": "de"})[1]["fields"] == {"lang": "invalid_value"}
    assert call({**VALID, "email": "nope"})[1]["fields"] == {"email": "invalid_format"}
    assert call({**VALID, "name": "x" * 101})[1]["fields"] == {"name": "too_long"}


@pytest.mark.parametrize("raw", ["{not json", "[]", '"str"', ""])
def test_bad_request(raw):
    assert call(None, raw=raw) == (400, {"error": "bad_request"})


def test_missing_body():
    res = lambda_handler({"requestContext": {}}, None)
    assert res["statusCode"] == 400


def test_ses_failure_500(ses):
    ses.send_email.side_effect = RuntimeError("boom ivan@example.com")
    assert call(VALID) == (500, {"error": "internal_error"})


def test_missing_config_500(monkeypatch):
    monkeypatch.delenv("LEAD_FROM_EMAIL")
    assert call(VALID) == (500, {"error": "internal_error"})


def test_dry_run(monkeypatch, ses):
    monkeypatch.setenv("LEAD_EMAIL_DRY_RUN", "true")
    assert call(VALID) == (200, {"ok": True})
    ses.send_email.assert_not_called()


def test_logs_have_no_pii(ses, caplog):
    with caplog.at_level(logging.DEBUG, logger="lead"):
        call(VALID)
        call({**VALID, "email": "bad\nx"})
        ses.send_email.side_effect = RuntimeError("ivan@example.com Secret")
        call(VALID)
    assert caplog.text
    for secret in ("Ivan", "ivan@example.com", "Secret project", "example.com"):
        assert secret not in caplog.text
    first = json.loads(caplog.records[0].getMessage())
    assert set(first) == {"event", "request_id", "status", "lang", "honeypot"}
