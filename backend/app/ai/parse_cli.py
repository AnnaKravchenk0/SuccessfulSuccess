"""CLI for ``make parse TEXT="..."``. Prints JSON agenda and token usage."""

from __future__ import annotations

import json
import sys
from datetime import datetime

from app.ai.agenda import AgendaParseError, cost_usd, parse_agenda
from app.config import settings


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    if not args:
        print('Usage: python -m app.ai.parse_cli "pasted text"', file=sys.stderr)
        return 2

    text = " ".join(args)
    today = datetime.now(settings.tz).date()
    try:
        agenda, usage = parse_agenda(text, today, settings.app_timezone)
    except AgendaParseError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(agenda.model_dump(mode="json"), ensure_ascii=False, indent=2))
    print(
        f"usage: input={usage['input_tokens']} output={usage['output_tokens']} "
        f"cost_usd={cost_usd(settings.parser_model, usage):.6f} "
        f"model={settings.parser_model}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
