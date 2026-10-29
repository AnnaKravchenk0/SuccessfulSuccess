output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "issuer" {
  value = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}

output "hosted_domain" {
  value = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"
}

output "google_redirect_uri" {
  value = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com/oauth2/idpresponse"
}

output "google_enabled" {
  value = local.has_google ? "true" : "false"
}

output "parser_url" {
  value = trimsuffix(aws_lambda_function_url.parser.function_url, "/")
}

output "parser_function_name" {
  value = aws_lambda_function.parser.function_name
}

output "parser_log_group_name" {
  value = aws_cloudwatch_log_group.parser.name
}

output "reports_bucket_name" {
  value = aws_s3_bucket.reports.bucket
}

output "report_requests_queue_url" {
  value = aws_sqs_queue.report_requests.url
}

output "report_requests_queue_arn" {
  value = aws_sqs_queue.report_requests.arn
}

output "dead_letter_queue_url" {
  value = aws_sqs_queue.report_requests_dlq.url
}

output "builder_function_name" {
  value = aws_lambda_function.builder.function_name
}

output "mailer_function_name" {
  value = aws_lambda_function.mailer.function_name
}

output "tfc_role_hint" {
  description = "Set this ARN as TFC_AWS_RUN_ROLE_ARN after applying tf-bootstrap/"
  value       = "arn:aws:iam::${local.account_id}:role/hcp-terraform-ooad-AnnaKravchenk0"
}
