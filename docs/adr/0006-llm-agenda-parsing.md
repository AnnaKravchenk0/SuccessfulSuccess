# ADR 0006 — LLM agenda parsing via Bedrock (outside the VPC)

**Status:** Accepted  
**Date:** 2026-10-27  
**Context:** Lab Part 4 — Paste an agenda

## Context

Users often receive agendas as free text (email, chat, notes), not as form fields. We want a feature that:

1. Accepts pasted text.
2. Asks an LLM to propose a structured agenda.
3. Shows a pre-filled form the user can correct.
4. Saves only through the existing validated API.

Constraints from earlier labs:

- The API Lambda sits in a **private VPC with no NAT** (cost).
- Idle cost should stay near **$0**.
- Pasted text is **untrusted data** (prompt injection).
- Every LLM call costs tokens; the endpoint must be authenticated and length-limited.

## Decision

- **Model:** Claude Haiku 4.5 on Amazon Bedrock **Runtime** via the US inference profile `PARSER_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0`, using the Anthropic Messages API (`AnthropicBedrock`) and a single tool `record_agenda`. Mantle short ids were not available on this account; Converse confirmed the `us.…` profile works. Chosen because it is enabled, cheap enough for classroom use, and good enough for structured agenda extraction with tool calling.
- **Where it runs:** A dedicated Lambda **outside the VPC** (`successfulsuccess-agenda-parser`) with a Function URL. It reaches Bedrock over the public internet. No NAT, no Bedrock VPC endpoint.
- **What it may do:** Parse only. Return JSON. Never write to Aurora.
- **What writes:** The browser saves via `PUT /api/v1/meetings/{id}/agenda` on the main API (in the VPC), including `ai_suggestion` (model output + model id + prompt version) next to the user-confirmed agenda.
- **Auth:** Cognito access token verified in the parser (JWKS fetched live; the function has internet).
- **Observability:** One JSON CloudWatch log line per parse (user, model, prompt version, tokens, latency, cost).
- **Budget:** AWS Budgets alarm at **$5 / month** to the operator email.

## Alternatives considered

| Alternative | Why it lost |
|---|---|
| **Claude Opus 5.5** (lab example model) | Not enabled on our Bedrock account; much more expensive than Haiku 4.5 for this parse job. |
| **Bedrock Mantle** short id `anthropic.claude-haiku-4-5` | 403 on this account; Haiku 4.5 is available through bedrock-runtime inference profiles instead. |
| Call Bedrock from the API Lambda through a **VPC interface endpoint** | ~$7.30/month idle; breaks the "$0 when idle" rule from Lab 4. Parser does not need the database. |
| Call the **Claude API directly** (Anthropic keys) over the internet | Extra secret to store and rotate; bill leaves AWS Budgets/Cost Explorer; Bedrock keeps IAM + AWS billing. |
| **Regex / rule-based** parser | Cheap and deterministic, but fails on multilingual messy notes (the whole point of the feature). Keep as a non-AI fallback only if Bedrock is down — the UI already lets the user type by hand. |

## Consequences

- **Cost per parse:** on Haiku 4.5 typically well under a cent (logged as `cost_usd` from ~$1.10 / $5.50 per 1M in/out tokens).
- **When Bedrock is down:** Parse fails with a clear error; the user types the agenda manually; meetings CRUD and weekly reports keep working.
- **Quality signal:** Diff between `ai_suggestion` and the saved agenda, with no extra user effort.
- **Prompt injection:** System prompt marks pasted text as data; schema validation; model never writes; user confirms every field before Save.
