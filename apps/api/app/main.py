import json
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import email as email_module
from app.config import load_settings
from app.rate_limit import RateLimiter
from app.validation import validate_lead

settings = load_settings()
logging.basicConfig(level=settings.log_level, format="%(message)s")
logger = logging.getLogger("api")

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.state.limiter = RateLimiter(settings.rate_limit_max, settings.rate_limit_window_seconds)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
}


def log(result: str, locale: str | None = None, **extra: object) -> None:
    # Без PII: ни имени, ни email, ни текста сообщения, ни IP.
    logger.info(json.dumps({"result": result, "locale": locale, **extra}))


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for k, v in SECURITY_HEADERS.items():
        response.headers[k] = v
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/lead")
async def create_lead(request: Request) -> JSONResponse:
    try:
        parsed = json.loads(await request.body())
    except (ValueError, UnicodeDecodeError):
        log("bad_request")
        return JSONResponse({"error": "bad_request"}, status_code=400)
    if not isinstance(parsed, dict):
        log("bad_request")
        return JSONResponse({"error": "bad_request"}, status_code=400)

    result = validate_lead(parsed)
    if result.ok and result.honeypot:
        log("honeypot")
        return JSONResponse({"ok": True})
    if not result.ok:
        fields = result.fields or {}
        log("validation_error", fields=list(fields))
        return JSONResponse({"error": "validation_error", "fields": fields}, status_code=400)
    lead = result.lead
    assert lead is not None

    try:
        if not app.state.limiter.allow(client_ip(request)):
            log("rate_limited", lead.locale)
            return JSONResponse({"error": "rate_limited"}, status_code=429)
        email_module.send_lead_email(lead)
    except Exception as err:
        log("internal_error", lead.locale, errorName=type(err).__name__)
        return JSONResponse({"error": "internal_error"}, status_code=500)

    log("sent", lead.locale)
    return JSONResponse({"ok": True})
