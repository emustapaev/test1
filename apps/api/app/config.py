import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    rate_limit_max: int
    rate_limit_window_seconds: int
    allowed_origins: list[str]
    dry_run: bool
    log_level: str


def load_settings() -> Settings:
    origins = os.environ.get("ALLOWED_ORIGINS", "https://krunai.uz")
    return Settings(
        rate_limit_max=_int("RATE_LIMIT_MAX", 5),
        rate_limit_window_seconds=_int("RATE_LIMIT_WINDOW_SECONDS", 60),
        allowed_origins=[o.strip() for o in origins.split(",") if o.strip()],
        dry_run=os.environ.get("LEAD_EMAIL_DRY_RUN", "").lower() in ("1", "true", "yes"),
        log_level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    )
