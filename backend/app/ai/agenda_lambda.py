"""Agenda-parser Lambda: Function URL → Cognito → Claude → JSON.

Runs outside the VPC (same pattern as the report mailer) so it can reach
Bedrock over the public internet with no NAT and no VPC endpoint.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import date
from typing import Any

from app.ai.agenda import (
    PROMPT_VERSION,
    AgendaParseError,
    cost_usd,
    parse_agenda,
)
from app.auth import AuthError, AuthNotConfiguredError, verify_access_token_sync
from app.config import settings

log = logging.getLogger("agenda_parser")
logging.getLogger().setLevel(settings.log_level)

MAX_TEXT_CHARS = 10_000

def _header(headers: dict[str, Any], name: str) -> str:
    lower = {str(k).lower(): v for k, v in headers.items()}
    value = lower.get(name.lower(), "")
    if isinstance(value, list):
        return value[0] if value else ""
    return str(value or "")


def _response(status: int, body: dict[str, Any]) -> dict:
    # Do not set Access-Control-* here: ParserFunctionUrl.Cors already adds them.
    # Duplicate ACAO headers make Chromium report net::ERR_FAILED with status 200.
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body),
    }


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    # OPTIONS preflight is answered by Function URL CORS (no invoke).
    method = (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod")
        or "POST"
    ).upper()
    headers = event.get("headers") or {}
    if method == "OPTIONS":
        return _response(204, {})

    try:
        user = verify_access_token_sync(_header(headers, "authorization"))
    except (AuthError, AuthNotConfiguredError) as exc:
        return _response(401, {"error": str(exc)})

    raw_body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64

        raw_body = base64.b64decode(raw_body).decode()

    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        return _response(400, {"error": "body must be JSON"})

    text = body.get("text")
    if not isinstance(text, str):
        return _response(400, {"error": "text is required"})
    if len(text) > MAX_TEXT_CHARS:
        return _response(
            413,
            {"error": f"text exceeds {MAX_TEXT_CHARS} characters"},
        )

    try:
        today = date.fromisoformat(body["today"])
        tz = body["tz"]
        if not isinstance(tz, str) or not tz:
            raise ValueError("tz")
    except (KeyError, TypeError, ValueError):
        return _response(
            400,
            {"error": "today (YYYY-MM-DD) and tz are required"},
        )

    started = time.monotonic()
    try:
        agenda, usage = parse_agenda(text, today, tz)
    except AgendaParseError as exc:
        return _response(422, {"error": str(exc)})
    except Exception:
        log.exception("agenda parse failed")
        return _response(
            503,
            {"error": "the parser is busy or unavailable; try again shortly"},
        )

    latency_ms = int((time.monotonic() - started) * 1000)
    cost = cost_usd(settings.parser_model, usage)
    log.info(
        json.dumps(
            {
                "event": "agenda_parsed",
                "user": user.sub,
                "model": settings.parser_model,
                "prompt_version": PROMPT_VERSION,
                "input_tokens": usage["input_tokens"],
                "output_tokens": usage["output_tokens"],
                "latency_ms": latency_ms,
                "cost_usd": round(cost, 6),
            }
        )
    )

    return _response(
        200,
        {
            "agenda": agenda.model_dump(mode="json"),
            "model": settings.parser_model,
            "prompt_version": PROMPT_VERSION,
        },
    )
