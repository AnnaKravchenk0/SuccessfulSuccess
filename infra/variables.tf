variable "project_name" {
  type        = string
  description = "Prefix for resource names (must match existing AWS names)."
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "app_urls" {
  type        = list(string)
  description = "Cognito callback/logout URLs (each ending with /)."
}

variable "google_client_id" {
  type        = string
  default     = ""
  description = "Google OAuth web client id. Empty disables Google IdP."
}

variable "google_client_secret" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Google OAuth client secret. Set in HCP workspace, not in tfvars."
}

variable "backend_stack_name" {
  type        = string
  description = "CloudFormation stack that still owns the API Lambda / Aurora."
  default     = "successfulsuccess-backend"
}

variable "frontend_stack_name" {
  type        = string
  description = "CloudFormation stack for S3 + CloudFront (CORS origins)."
  default     = "successfulsuccess-frontend"
}

variable "architecture" {
  type    = string
  default = "x86_64"
  validation {
    condition     = contains(["x86_64", "arm64"], var.architecture)
    error_message = "architecture must be x86_64 or arm64."
  }
}

variable "parser_model" {
  type    = string
  default = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "budget_alert_email" {
  type = string
}

variable "report_recipients" {
  type        = string
  description = "Comma-separated SES recipients for the weekly report."
}

variable "sender_email" {
  type = string
}

variable "schedule_expression" {
  type    = string
  default = "cron(0 7 ? * MON *)"
}

variable "schedule_timezone" {
  type    = string
  default = "Europe/Kyiv"
}

variable "app_timezone" {
  type    = string
  default = "Europe/Kyiv"
}

variable "database_url" {
  type        = string
  sensitive   = true
  description = "Same DATABASE_URL as the API Lambda. Prefer HCP sensitive var."
}

variable "image_uri" {
  type        = string
  description = "Backend container image URI (digest-pinned) for builder + parser."
  default     = ""
}

variable "vpc_id" {
  type        = string
  description = "Override VPC; empty reads from the backend Lambda."
  default     = ""
}

variable "subnet_ids" {
  type        = list(string)
  description = "Override subnets; empty reads from the backend Lambda."
  default     = []
}

variable "subnet_route_table_ids" {
  type        = list(string)
  description = "Route tables for the S3 gateway endpoint."
}

variable "builder_security_group_id" {
  type        = string
  description = "Security group shared with the API Lambda."
  default     = ""
}
