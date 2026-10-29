# Copy to cloud.tf (gitignored if you prefer) after:
#   terraform login
#   HCP org ooad-AnnaKravchenk0 + workspace successfulsuccess-dev
#   TFC_AWS_PROVIDER_AUTH + TFC_AWS_RUN_ROLE_ARN on the workspace
# Then: terraform init  (migrate local state when prompted)
#
# VCS: connect this GitHub repo, working directory = infra/

terraform {
  cloud {
    organization = "ooad-AnnaKravchenk0"
    workspaces {
      name = "SuccessfulSuccess"
    }
  }
}
