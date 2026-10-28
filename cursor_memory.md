# SuccessfulSuccess — Project Memory & Context

> Last updated: 2026-10-28  
> GitHub repo: https://github.com/AnnaKravchenk0/SuccessfulSuccess  
> AWS Account: `260898619483` | Primary region: `us-east-1`

---

## Project Overview

**SuccessfulSuccess** is a meetings-management web application built at UCU for a 2nd-year OOAD course.  
The stack is:
- **Frontend**: React / Next.js (deployed to S3 + CloudFront)
- **Backend API**: FastAPI on AWS Lambda (containerised, in a private VPC)
- **Database**: Amazon Aurora Serverless v2 (PostgreSQL-compatible, private subnets)
- **Auth**: Amazon Cognito (Lab 3)
- **CI/CD**: GitHub Actions with OIDC authentication (no static AWS credentials)
- **IaC**: AWS CloudFormation templates in `infra/`
- **AI (Lab Part 4)**: Claude Haiku 4.5 on **Bedrock Runtime** (US inference profile) via agenda-parser Lambda **outside VPC**

---

## Lab History

### Labs 1–3
- Lab 1–2: Initial FastAPI app, Docker setup.
- Lab 3: Amazon Cognito authentication (`f7c569d`).

### Lab 4
- API Lambda in **private VPC** (no NAT) to reach Aurora.
- GitHub Actions CI/CD with OIDC (`df42053`).
- Constraint: API Lambda cannot reach the internet.

### Lab 5 — Event-Driven Weekly Meetings Report
```
EventBridge Scheduler (Mon 07:00 Europe/Kyiv)
  → SQS successfulsuccess-report-requests (+ DLQ)
  → Lambda successfulsuccess-report-builder (IN VPC) → Aurora → S3 CSV
  → S3 ObjectCreated → Lambda successfulsuccess-report-mailer (OUTSIDE VPC) → SES
```

### Lab Part 4 — Paste an agenda (DONE)
```
Browser (paste text + Cognito Bearer token)
  → POST Function URL → successfulsuccess-agenda-parser (OUTSIDE VPC)
       · verify Cognito JWT (JWKS over internet)
       · Claude Haiku 4.5 via AnthropicBedrock + tool_choice record_agenda
       · Pydantic validate + one retry
       · CloudWatch JSON log (tokens, latency, cost_usd)
  → browser shows pre-filled form (suggested badges)
  → PUT /api/v1/meetings/{id}/agenda → API Lambda (IN VPC) → Aurora
       · agenda_items, action_items, ai_suggestion JSONB
```

Architecture lesson: **LLM suggests outside the VPC; trusted API writes inside.** No NAT, no Bedrock VPC endpoint ($0 idle).

---

## Live deploy (2026-10-28)

| What | Value |
|---|---|
| Site | https://d1f03icpsr7l8b.cloudfront.net |
| ParserUrl | https://iklt6hptstswnulhcy34ix3rsa0jeoet.lambda-url.us-east-1.on.aws/ |
| Model | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Prompt | `agenda-v1` |
| Image (CORS fix) | `…/successfulsuccess-backend@sha256:4fde6a12…` |
| Feature commit | `dcec336` |
| Runtime model commit | `f8c9420` |
| Submission pack | `docs/lab-part4-submission.md` |

UI path: meeting details → **Add agenda** → Paste → Parse → edit → Save.  
There is no separate “AI” page.

---

## Complete changelog — Lab Part 4

### NEW files

| Path | What it does |
|---|---|
| `backend/app/ai/*` | `agenda.py`, `agenda_lambda.py`, `bedrock_client.py`, `hello.py`, `parse_cli.py` |
| `backend/app/models/agenda.py` | ORM agenda / action item rows |
| `backend/alembic/versions/0003_agenda_and_ai_suggestion.py` | `ai_suggestion` JSONB + item tables |
| `infra/ai.yml` | Parser Lambda (no VPC), Function URL + CORS, IAM `bedrock:InvokeModel`, $5 Budget |
| `frontend/components/agenda-dialog.tsx` | Paste / Parse / Cancel / suggested badges / Save |
| `docs/adr/0006-llm-agenda-parsing.md` | ADR |
| `docs/architecture/c4-containers.md` | C4 L2 parse vs save arrows |
| `docs/lab6-step5-template.md` | Blank Step 5 template |
| `docs/lab-part4-submission.md` | **Filled** table, CloudWatch line, answers |
| `cursor_memory.md` | This file |

### Key fixes after first deploy

1. **Mantle 403** → switch to Bedrock **Runtime** US profile + `AnthropicBedrock` (`bedrock_client.py`), IAM `bedrock:InvokeModel`.
2. **422 no tool_use** → flatten tool JSON schema + `tool_choice` force `record_agenda`.
3. **Cold start “could not reach”** → parser Memory **1024 MB**, Timeout **60 s**.
4. **`net::ERR_FAILED 200 (OK)`** → duplicate `Access-Control-Allow-Origin` (Function URL Cors **and** Lambda response). Removed CORS headers from `agenda_lambda.py`; Function URL owns CORS.
5. **Windows Makefile** → no mid-recipe `#` comments; `get-function` for ImageUri; Budgets email from `REPORT_RECIPIENTS`.

---

## Make targets (Part 4)

| Target | Purpose |
|---|---|
| `make llm-hello` | One Claude call; prints answer + usage |
| `make parse TEXT="…"` | Local `parse_agenda`; JSON + cost |
| `make aws-deploy-ai` | Deploy `infra/ai.yml` |
| `make aws-ai-env` | Print `NEXT_PUBLIC_PARSER_URL=…` |
| `make aws-push` | Rebuild/push backend image (also used by parser) |

---

## Key architectural decisions

### Parser outside VPC
Needs Bedrock, **not** DB → outside VPC, $0 idle. Model never writes. Save via validated API.  
Rejected: VPC Bedrock endpoint (~$7.30/mo), direct Anthropic API, regex-only parser. See ADR 0006.

### Auth on parser
Function URL `AuthType: NONE`; app verifies Cognito access token. JWKS fetched live.

### CORS
**Only** `AWS::Lambda::Url` Cors (origins = CloudFront + localhost). Do **not** also emit `Access-Control-*` from the handler — Chromium then reports `ERR_FAILED` with status 200.

---

## AWS infrastructure state

### `successfulsuccess-ai`
| Resource | Name |
|---|---|
| Parser Lambda | `successfulsuccess-agenda-parser` |
| Function URL | stack output `ParserUrl` |
| Log group | `/aws/lambda/successfulsuccess-agenda-parser` |
| IAM | `bedrock:InvokeModel` (+ WithResponseStream) on `*` |
| Budget | `successfulsuccess-monthly-5usd` ($5) |

### Env (`.env`, not committed)
```
PARSER_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
NEXT_PUBLIC_PARSER_URL=https://iklt6hptstswnulhcy34ix3rsa0jeoet.lambda-url.us-east-1.on.aws
BUDGET_ALERT_EMAIL=a.kravchenko.pn@ucu.edu.ua
```

---

## Constraints & rules

- ⚠️ **No NAT Gateway** — API/builder private VPC; parser + mailer outside.
- ⚠️ **Bedrock** — Runtime US profile Haiku 4.5 (not Mantle / not Opus 5.5 on this account).
- ⚠️ **Cost** — ~$0.002 / parse; $5 Budgets alarm.
- ⚠️ **Never duplicate CORS** on Function URL responses.
- ⚠️ After `aws-push`, update **both** `successfulsuccess-backend` and `successfulsuccess-agenda-parser` image URIs (CI does parser with `|| true`).

---

## Moodle / remaining for the human

- [x] Deploy AI stack + frontend with `NEXT_PUBLIC_PARSER_URL`
- [x] Step 5 table + answers + CloudWatch line → `docs/lab-part4-submission.md`
- [ ] Confirm Budgets email subscription in inbox
- [ ] Screen recording ≤45 s (paste → edit → save)
- [ ] Submit: commit link + recording + submission content
- [ ] (Optional stretch) PDF/photo, Ask Spry, pgvector, Polly
