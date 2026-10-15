"""Lambda handler for the report-builder function.

Triggered by:
  1. EventBridge Scheduler  → event = {"source": "schedule"}
  2. SQS EventSourceMapping → event = {"Records": [{"body": '{"week": "2026-W40", "source": "sqs"}'}]}
  3. Direct invocation      → event = {"week": "2026-W40"}

The handler writes the CSV to S3.  Uploading the file triggers the
report-mailer function via an S3 ObjectCreated notification (the mailer
is a completely separate Lambda — the builder never calls it).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone

import boto3

from app.reports.weekly import build_weekly_report

log = logging.getLogger("report_builder")
logging.getLogger().setLevel(os.environ.get("LOG_LEVEL", "INFO"))
log.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

BUCKET = os.environ.get("REPORTS_BUCKET", "")


def _previous_iso_week() -> str:
    """Return the ISO week string for last week (UTC)."""
    last_monday = datetime.now(timezone.utc) - timedelta(weeks=1)
    return last_monday.strftime("%G-W%V")


def detect_trigger(event: dict) -> str:
    """Classify the event into a human-readable trigger name for logging."""
    if "Records" in event:
        source = event["Records"][0].get("eventSource", "")
        if "sqs" in source:
            return "sqs"
        if "s3" in source:
            return "s3"
        return "records"
    src = event.get("source", "")
    if "schedule" in src or src == "aws.scheduler":
        return "schedule"
    return "direct"


def handler(event: dict, context) -> dict:
    trigger = detect_trigger(event)

    # --- Unpack the week from whichever event shape arrived -----------------
    week: str | None = None

    if "Records" in event:
        raw_body = event["Records"][0].get("body", "{}")
        try:
            body = json.loads(raw_body)
        except Exception:
            try:
                import ast
                body = ast.literal_eval(raw_body)
            except Exception:
                body = {}
        if isinstance(body, dict):
            week = body.get("week") or None
    else:
        week = event.get("week") or None

    if not week:
        week = _previous_iso_week()

    log.info(f"report-builder triggered: trigger={trigger} week={week}")

    # --- Build the CSV -------------------------------------------------------
    csv_bytes = build_weekly_report(week)

    # --- Upload to S3 --------------------------------------------------------
    s3_key = f"reports/{week}.csv"
    s3 = boto3.client("s3")
    s3.put_object(
        Bucket=BUCKET,
        Key=s3_key,
        Body=csv_bytes,
        ContentType="text/csv",
    )

    log.info("report uploaded", extra={"bucket": BUCKET, "key": s3_key, "bytes": len(csv_bytes)})
    return {"week": week, "key": s3_key, "bytes": len(csv_bytes)}

