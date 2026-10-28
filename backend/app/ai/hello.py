"""Smoke-test: one Claude call on Bedrock Mantle. Run with ``make llm-hello``."""

from __future__ import annotations

from anthropic import AnthropicBedrockMantle

from app.config import settings


def main() -> None:
    client = AnthropicBedrockMantle(aws_region=settings.cognito_region or "us-east-1")
    msg = client.messages.create(
        model=settings.parser_model,
        max_tokens=1024,
        output_config={"effort": "low"},
        messages=[
            {
                "role": "user",
                "content": "In one sentence: what is an ISO week?",
            }
        ],
    )
    text = next(block.text for block in msg.content if block.type == "text")
    print(text)
    print(
        f"stop_reason={msg.stop_reason} "
        f"input_tokens={msg.usage.input_tokens} "
        f"output_tokens={msg.usage.output_tokens}"
    )


if __name__ == "__main__":
    main()
