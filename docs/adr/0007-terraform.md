# ADR 0007 — Terraform for auth, reports, and AI infrastructure

**Status:** Accepted  
**Date:** 2026-10-28  
**Context:** Lab task — move Lab 4–6 CloudFormation stacks to Terraform

## Context

Auth (Cognito), weekly reports, and the agenda parser were three CloudFormation stacks. The app already touches systems outside a single AWS account (Google OAuth, GitHub Actions). We need a second environment later, reviewed plans before every change, and one tool the team can use everywhere.

## Decision

- **Tool:** Terraform (HCL) with the HashiCorp AWS provider (~> 6), not CloudFormation, for `auth` / `reports` / `ai`.
- **Layout:** One root module under [`infra/`](../../infra/) (`versions.tf`, `variables.tf`, `auth.tf`, `reports.tf`, `ai.tf`, `outputs.tf`, `terraform.tfvars`). Backend, frontend, and ECR remain CloudFormation for now; Terraform reads them with `data "aws_cloudformation_stack"` / `data "aws_lambda_function"`.
- **State:** HCP Terraform workspace `successfulsuccess-dev` in org `ooad-AnnaKravchenk0` (Remote execution). Bootstrap IAM OIDC role `hcp-terraform-ooad-AnnaKravchenk0` (see [`tf-bootstrap/`](../../tf-bootstrap/)) so runs assume AWS without static keys. Local state was used only for the one-time import migration.
- **Who changes infra:** Pull request → HCP plan check → merge → HCP apply. No `terraform apply` in the Makefile. App deploys stay on GitHub Actions OIDC.
- **Secrets:** `google_client_secret` and `database_url` are `sensitive` variables (HCP workspace / `TF_VAR_*`), never committed in `terraform.tfvars`.
- **Adoption:** Existing resources were retained (`DeletionPolicy: Retain`), CloudFormation stacks deleted, then imported (`import` blocks) until `terraform plan` showed **No changes**.

## Alternatives considered

| Alternative | Why it lost |
|---|---|
| **Stay on CloudFormation** | AWS-only; weaker multi-cloud story; we already need Google + GitHub; plan/review culture fits Terraform better for this course. |
| **CDK** | Still CloudFormation under the hood; team would learn two abstraction layers; HCL matches the lab walkthrough. |
| **OpenTofu** | Compatible fork; fine technically. HCP Terraform + course materials use Terraform branding and free tier; we stay with Terraform CLI. |
| **Recreate resources from scratch** | Would wipe Cognito users and report objects. Import + Retain was required. |

## Consequences

- **Cost / idle:** Unchanged architecture (parser and mailer outside VPC; no NAT).
- **If HCP Terraform is down:** Emergency path is Local execution on the workspace (or a laptop with remote state) using the same HCL; still prefer PR review when the service returns. Read-only: `terraform plan` / `make infra-plan` with AWS credentials.
- **Drift:** Every plan compares live AWS to HCL. Console edits show up as `~` and are reverted on the next apply unless the fix is committed.
- **Makefile:** `make infra-plan` / `infra-outputs` / `aws-auth-env` / `aws-ai-env` / `aws-reports-env` read Terraform outputs. `aws-deploy-auth|reports|ai` no longer call CloudFormation.
