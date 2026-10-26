import base64
import binascii
import json
import logging
import os
from typing import Any

from lead import email as email_module
from lead.validation import validate_lead

logger = logging.getLogger("lead")
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())

_HEADERS = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
}


def _response(status: int, body: dict[str, Any]) -> dict[str, Any]:
    return {"statusCode": status, "headers": _HEADERS, "body": json.dumps(body)}


def _log(event: str, request_id: str | None, status: int, lang: str | None, honeypot: bool) -> None:
    # Только служебные поля: без имени, email и текста сообщения.
    logger.info(
        json.dumps(
            {
                "event": event,
                "request_id": request_id,
                "status": status,
                "lang": lang,
                "honeypot": honeypot,
            }
        )
    )


def _parse_body(event: dict[str, Any]) -> Any:
    raw = event.get("body")
    if raw is None:
        raise ValueError("empty body")
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw, validate=True).decode("utf-8")
    return json.loads(raw)


def lambda_handler(event: dict[str, Any], context: Any = None) -> dict[str, Any]:
    request_id = (event.get("requestContext") or {}).get("requestId")
    try:
        try:
            body = _parse_body(event)
        except (ValueError, binascii.Error):  # JSONDecodeError/UnicodeDecodeError ⊂ ValueError
            body = None
        if not isinstance(body, dict):
            _log("bad_request", request_id, 400, None, False)
            return _response(400, {"error": "bad_request"})

        result = validate_lead(body)
        if result.honeypot:
            _log("honeypot_triggered", request_id, 200, None, True)
            return _response(200, {"ok": True})
        if result.lead is None:
            _log("validation_failed", request_id, 400, None, False)
            return _response(400, {"error": "validation_error", "fields": result.fields})

        email_module.send_lead_email(result.lead)
        _log("lead_sent", request_id, 200, result.lead.lang, False)
        return _response(200, {"ok": True})
    except Exception as exc:  # noqa: BLE001
        # Только тип исключения: текст может содержать PII.
        logger.error(
            json.dumps(
                {
                    "event": "internal_error",
                    "request_id": request_id,
                    "status": 500,
                    "error_type": type(exc).__name__,
                }
            )
        )
        return _response(500, {"error": "internal_error"})
