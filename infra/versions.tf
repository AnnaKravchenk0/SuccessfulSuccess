terraform {
  required_version = ">= 1.10"

  # HCP Terraform — enable by copying cloud.tf.example → cloud.tf after
  # `terraform login` and creating workspace successfulsuccess-dev
  # (see docs/hcp-terraform-setup.md). Local state was used for the import.

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      PROJECT_NAME = var.project_name
    }
  }
}
