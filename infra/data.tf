# Remaining Lab 4 stacks stay in CloudFormation; Terraform only reads them.

data "aws_caller_identity" "current" {}

data "aws_cloudformation_stack" "backend" {
  name = var.backend_stack_name
}

data "aws_cloudformation_stack" "frontend" {
  name = var.frontend_stack_name
}

data "aws_lambda_function" "api" {
  function_name = data.aws_cloudformation_stack.backend.outputs["FunctionName"]
}

locals {
  account_id = data.aws_caller_identity.current.account_id

  image_uri = coalesce(
    var.image_uri != "" ? var.image_uri : null,
    try(data.aws_lambda_function.api.image_uri, null),
  )

  vpc_id = coalesce(
    var.vpc_id != "" ? var.vpc_id : null,
    try(data.aws_lambda_function.api.vpc_config[0].vpc_id, null),
  )

  subnet_ids = length(var.subnet_ids) > 0 ? var.subnet_ids : try(data.aws_lambda_function.api.vpc_config[0].subnet_ids, [])

  builder_security_group_id = coalesce(
    var.builder_security_group_id != "" ? var.builder_security_group_id : null,
    try(tolist(data.aws_lambda_function.api.vpc_config[0].security_group_ids)[0], null),
  )

  frontend_origins = compact(split(",", try(data.aws_cloudformation_stack.frontend.outputs["AllowedOrigins"], "")))

  # Cognito callback URLs end with "/"; CORS origins must not.
  app_urls_as_origins = [for u in var.app_urls : trimsuffix(u, "/")]

  # Order matches the live parser env (CloudFormation Join order).
  cors_origins = distinct(concat(
    local.frontend_origins,
    ["http://localhost:3000"],
    local.app_urls_as_origins,
  ))

  reports_bucket_name = "${var.project_name}-reports-${local.account_id}"

  has_google = var.google_client_id != ""
}
