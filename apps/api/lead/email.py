import os
from datetime import UTC, datetime

import boto3

from lead.validation import Lead

_client = None


def _ses():
    global _client
    if _client is None:
        _client = boto3.client("sesv2")
    return _client


def build_subject(lead: Lead) -> str:
    return f"[{lead.lang.upper()}] New lead from krunai.uz"


def build_body(lead: Lead, now: datetime | None = None) -> str:
    ts = (now or datetime.now(UTC)).strftime("%Y-%m-%d %H:%M:%S UTC")
    return "\n".join(
        [
            f"Name: {lead.name}",
            f"Email: {lead.email}",
            f"Language: {lead.lang.upper()}",
            f"Time: {ts}",
            "",
            "Message:",
            lead.message,
            "",
        ]
    )


def send_lead_email(lead: Lead) -> None:
    """Отправляет письмо через SES v2. Адреса берутся только из окружения."""
    recipient = os.environ.get("LEAD_RECIPIENT_EMAIL", "").strip()
    sender = os.environ.get("LEAD_FROM_EMAIL", "").strip()
    if not recipient or not sender:
        raise RuntimeError("LEAD_RECIPIENT_EMAIL/LEAD_FROM_EMAIL are not set")
    if os.environ.get("LEAD_EMAIL_DRY_RUN", "").strip().lower() == "true":
        return
    _ses().send_email(
        FromEmailAddress=sender,
        Destination={"ToAddresses": [recipient]},
        ReplyToAddresses=[lead.email],
        Content={
            "Simple": {
                "Subject": {"Data": build_subject(lead), "Charset": "UTF-8"},
                "Body": {"Text": {"Data": build_body(lead), "Charset": "UTF-8"}},
            }
        },
    )
