"""Shared Bedrock Runtime client (Anthropic Messages via InvokeModel).

We use bedrock-runtime with a US inference profile because Mantle short model
ids are not enabled on this account. Same Messages + tools shape as the lab.
"""

from __future__ import annotations

from anthropic import AnthropicBedrock

from app.config import settings


def make_bedrock_client() -> AnthropicBedrock:
    return AnthropicBedrock(aws_region=settings.cognito_region or "us-east-1")
