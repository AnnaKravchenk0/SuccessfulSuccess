"""Report-mailer Lambda: triggered by S3 ObjectCreated on the reports prefix."""
from __future__ import annotations

import email.message
import logging
import os

import boto3

log = logging.getLogger("report_mailer")
logging.getLogger().setLevel(os.environ.get("LOG_LEVEL", "INFO"))
log.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

RECIPIENTS = [r.strip() for r in os.environ.get("REPORT_RECIPIENTS", "").split(",") if r.strip()]
SENDER = os.environ.get("SENDER_EMAIL", "")


def detect_trigger(event: dict) -> str:
    if "Records" in event:
        src = event["Records"][0].get("eventSource", "")
        if "s3" in src:
            return "s3"
    return "unknown"


def handler(event: dict, context) -> None:
    trigger = detect_trigger(event)
    record = event["Records"][0]["s3"]
    bucket = record["bucket"]["name"]
    key = record["object"]["key"]

    log.info(f"report-mailer triggered: trigger={trigger} bucket={bucket} key={key}")

    if not RECIPIENTS:
        log.warning("REPORT_RECIPIENTS is empty — nothing to send")
        return
    if not SENDER:
        log.warning("SENDER_EMAIL is empty — cannot send")
        return

    s3 = boto3.client("s3")
    resp = s3.get_object(Bucket=bucket, Key=key)
    csv_bytes = resp["Body"].read()

    week = key.split("/")[-1].replace(".csv", "")

    msg = email.message.EmailMessage()
    msg["Subject"] = f"Weekly meetings report - {week}"
    msg["From"] = SENDER
    msg["To"] = ", ".join(RECIPIENTS)
    msg.set_content(
        f"Hi,\n\nPlease find the weekly meetings report for {week} attached.\n\n"
        "This email was sent automatically.\n"
    )
    msg.add_attachment(
        csv_bytes,
        maintype="text",
        subtype="csv",
        filename=f"meetings-{week}.csv",
    )

    sesv2 = boto3.client("sesv2")
    sesv2.send_email(
        Content={"Raw": {"Data": msg.as_bytes()}},
    )
    log.info("email sent", extra={"week": week, "recipients": RECIPIENTS})
