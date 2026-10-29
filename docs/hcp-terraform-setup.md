# HCP Terraform setup (submission items 2–3)

Bootstrap IAM is already applied (`tf-bootstrap/` → role
`arn:aws:iam::260898619483:role/hcp-terraform-ooad-AnnaKravchenk0`).

## One-time

1. Sign up / sign in at https://app.terraform.io and create organization
   **`ooad-AnnaKravchenk0`** (or change the name in `infra/cloud.tf.example` +
   `tf-bootstrap/terraform.tfvars` and re-apply bootstrap).
2. Create workspace **`successfulsuccess-dev`**, execution mode **Remote**.
3. Workspace **Environment** variables:
   - `TFC_AWS_PROVIDER_AUTH` = `true`
   - `TFC_AWS_RUN_ROLE_ARN` = `arn:aws:iam::260898619483:role/hcp-terraform-ooad-AnnaKravchenk0`
4. Workspace **Terraform** variables (sensitive where noted):
   - `google_client_secret` (sensitive)
   - `database_url` (sensitive) — same value as the API Lambda `DATABASE_URL`
   - Non-secrets may stay in committed `infra/terraform.tfvars`
5. On your laptop: `terraform login`, then from `infra/`:
   - copy `cloud.tf.example` → `cloud.tf`
   - `terraform init` → migrate local state to HCP when asked
6. VCS: Settings → Version Control → connect this GitHub repo, working directory
   **`infra/`**. Enable speculative plans on PRs; apply on merge to `main`.

## Prove Apply finished (screenshot)

1. Open a PR that changes one harmless attribute (e.g. parser log retention
   `14` → `21` in `infra/ai.tf`).
2. Wait for the HCP plan check on the PR.
3. Merge to `main`.
4. In HCP: Runs → the apply run → **Apply finished**.
5. Screenshot that page for Moodle.

## Submission artifact already in repo

- Post-migration plan: [`docs/terraform-plan-no-changes.txt`](terraform-plan-no-changes.txt)
  (ends with **No changes. Your infrastructure matches the configuration.**)
