import re
from dataclasses import dataclass
from typing import Any

ALLOWED_LOCALES = ("en", "ru")
DEFAULT_LOCALE = "en"

# Без пробелов/CR/LF и без символов, которые разбирают адресные заголовки.
EMAIL_RE = re.compile(r'^[^\s@,;<>"()\[\]\\]+@[^\s@,;<>"()\[\]\\]+\.[^\s@,;<>"()\[\]\\]+$')


@dataclass(frozen=True)
class Lead:
    name: str
    email: str
    message: str
    locale: str = DEFAULT_LOCALE


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    lead: Lead | None = None
    honeypot: bool = False
    fields: dict[str, str] | None = None


def _check_text(value: Any, min_len: int, max_len: int) -> tuple[str | None, str | None]:
    """Returns (value, error_code)."""
    if value is None:
        return None, "required"
    if not isinstance(value, str):
        return None, "invalid_format"
    v = value.strip()
    if len(v) == 0:
        return None, "required"
    if len(v) < min_len:
        return None, "too_short"
    if len(v) > max_len:
        return None, "too_long"
    return v, None


def validate_lead(body: Any) -> ValidationResult:
    data: dict[str, Any] = body if isinstance(body, dict) else {}

    website = data.get("website")
    if isinstance(website, str) and website.strip() != "":
        return ValidationResult(ok=True, honeypot=True)

    fields: dict[str, str] = {}

    name, err = _check_text(data.get("name"), 1, 100)
    if err:
        fields["name"] = err

    email, err = _check_text(data.get("email"), 1, 254)
    if err:
        fields["email"] = "invalid_format" if err == "too_short" else err
    elif not EMAIL_RE.match(email or ""):
        fields["email"] = "invalid_format"

    message, err = _check_text(data.get("message"), 10, 2000)
    if err:
        fields["message"] = err

    locale = DEFAULT_LOCALE
    raw_locale = data.get("locale")
    if raw_locale is not None:
        if isinstance(raw_locale, str) and raw_locale in ALLOWED_LOCALES:
            locale = raw_locale
        else:
            fields["locale"] = "invalid_value"

    if fields:
        return ValidationResult(ok=False, fields=fields)
    return ValidationResult(
        ok=True,
        lead=Lead(name=name or "", email=email or "", message=message or "", locale=locale),
    )
