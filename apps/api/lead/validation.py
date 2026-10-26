import re
from dataclasses import dataclass
from typing import Any

ALLOWED_LANGS = ("en", "ru")

# Без пробелов/CR/LF и без символов, которые разбирают адресные заголовки.
EMAIL_RE = re.compile(r'^[^\s@,;<>"()\[\]\\]+@[^\s@,;<>"()\[\]\\]+\.[^\s@,;<>"()\[\]\\]+$')
_CRLF = ("\r", "\n")


@dataclass(frozen=True)
class Lead:
    name: str
    email: str
    message: str
    lang: str


@dataclass(frozen=True)
class ValidationResult:
    lead: Lead | None = None
    honeypot: bool = False
    fields: dict[str, str] | None = None


def _check_text(value: Any, max_len: int, *, single_line: bool = False) -> tuple[str, str | None]:
    """Возвращает (значение, код_ошибки)."""
    if value is None:
        return "", "required"
    if not isinstance(value, str):
        return "", "invalid_format"
    if single_line and any(c in value for c in _CRLF):
        return "", "invalid_format"
    v = value.strip()
    if not v:
        return "", "required"
    if len(v) > max_len:
        return "", "too_long"
    return v, None


def validate_lead(body: Any) -> ValidationResult:
    data: dict[str, Any] = body if isinstance(body, dict) else {}

    website = data.get("website")
    if isinstance(website, str) and website.strip():
        return ValidationResult(honeypot=True)

    fields: dict[str, str] = {}

    name, err = _check_text(data.get("name"), 100, single_line=True)
    if err:
        fields["name"] = err

    email, err = _check_text(data.get("email"), 254, single_line=True)
    if err:
        fields["email"] = err
    elif not EMAIL_RE.match(email):
        fields["email"] = "invalid_format"

    message, err = _check_text(data.get("message"), 5000)
    if err:
        fields["message"] = err

    lang = data.get("lang")
    if lang is None:
        fields["lang"] = "required"
    elif not isinstance(lang, str) or lang not in ALLOWED_LANGS:
        fields["lang"] = "invalid_value"

    if fields:
        return ValidationResult(fields=fields)
    return ValidationResult(lead=Lead(name=name, email=email, message=message, lang=lang))
