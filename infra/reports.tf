resource "aws_s3_bucket" "reports" {
  bucket = local.reports_bucket_name
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket = aws_s3_bucket.reports.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    id     = "delete-old-reports"
    status = "Enabled"

    filter {
      prefix = "reports/"
    }

    expiration {
      days = 90
    }
  }
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = local.vpc_id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = var.subnet_route_table_ids
}

resource "aws_sqs_queue" "report_requests_dlq" {
  name                      = "${var.project_name}-report-requests-dlq"
  message_retention_seconds = 1209600
  max_message_size          = 1048576
}

resource "aws_sqs_queue" "report_requests" {
  name                       = "${var.project_name}-report-requests"
  visibility_timeout_seconds = 540
  max_message_size           = 1048576

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.report_requests_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_iam_role" "scheduler" {
  name = "successfulsuccess-reports-SchedulerRole-sPb0DR4Qd0Es"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_send" {
  name = "send-to-queue"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sqs:SendMessage"
      Resource = aws_sqs_queue.report_requests.arn
    }]
  })
}

resource "aws_iam_role" "builder" {
  name = "successfulsuccess-reports-BuilderRole-WVBO66MBIvsf"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "builder_vpc" {
  role       = aws_iam_role.builder.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "builder_sqs" {
  role       = aws_iam_role.builder.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

resource "aws_iam_role_policy" "builder_s3" {
  name = "write-reports-bucket"
  role = aws_iam_role.builder.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject"]
      Resource = "arn:aws:s3:::${local.reports_bucket_name}/reports/*"
    }]
  })
}

resource "aws_iam_role" "mailer" {
  name = "successfulsuccess-reports-MailerRole-bj8ulQyV0xRO"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "mailer_basic" {
  role       = aws_iam_role.mailer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "mailer_rw" {
  name = "read-reports-and-send-email"
  role = aws_iam_role.mailer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "s3:GetObject"
        Resource = "arn:aws:s3:::${local.reports_bucket_name}/reports/*"
      },
      {
        Effect   = "Allow"
        Action   = "ses:SendRawEmail"
        Resource = "*"
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "builder" {
  name              = "/aws/lambda/${var.project_name}-report-builder"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "mailer" {
  name              = "/aws/lambda/${var.project_name}-report-mailer"
  retention_in_days = 14
}

resource "aws_lambda_function" "builder" {
  function_name = "${var.project_name}-report-builder"
  description   = "Queries Aurora and writes a weekly CSV to S3"
  role          = aws_iam_role.builder.arn
  package_type  = "Image"
  image_uri     = local.image_uri
  architectures = [var.architecture]
  memory_size   = 512
  timeout       = 90

  image_config {
    command = ["app.reports.lambda_handler.handler"]
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.builder.name
  }

  vpc_config {
    subnet_ids         = local.subnet_ids
    security_group_ids = [local.builder_security_group_id]
  }

  environment {
    variables = {
      DATABASE_URL   = var.database_url
      APP_TIMEZONE   = var.app_timezone
      REPORTS_BUCKET = local.reports_bucket_name
      LOG_LEVEL      = "INFO"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.builder,
    aws_iam_role_policy_attachment.builder_vpc,
    aws_iam_role_policy_attachment.builder_sqs,
    aws_iam_role_policy.builder_s3,
  ]

  lifecycle {
    ignore_changes = [environment]
  }
}

resource "aws_lambda_event_source_mapping" "builder" {
  event_source_arn        = aws_sqs_queue.report_requests.arn
  function_name           = aws_lambda_function.builder.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]
}

resource "aws_scheduler_schedule" "weekly" {
  name                         = "${var.project_name}-weekly-report"
  description                  = "Sends a report-request to SQS every Monday morning"
  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.schedule_timezone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_sqs_queue.report_requests.arn
    role_arn = aws_iam_role.scheduler.arn
    # Exact JSON retained from CloudFormation (avoid whitespace churn).
    input = "{\"week\": null, \"source\": \"schedule\"}"
  }
}

data "archive_file" "mailer" {
  type        = "zip"
  output_path = "${path.module}/.build/report-mailer.zip"

  source {
    filename = "index.py"
    content  = file("${path.module}/mailer/index.py")
  }
}

resource "aws_lambda_function" "mailer" {
  function_name    = "${var.project_name}-report-mailer"
  description      = "Sends the weekly CSV as an email attachment via SES"
  role             = aws_iam_role.mailer.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.mailer.output_path
  source_code_hash = data.archive_file.mailer.output_base64sha256
  memory_size      = 256
  timeout          = 30

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.mailer.name
  }

  environment {
    variables = {
      REPORT_RECIPIENTS = var.report_recipients
      SENDER_EMAIL      = var.sender_email
      LOG_LEVEL         = "INFO"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.mailer,
    aws_iam_role_policy_attachment.mailer_basic,
    aws_iam_role_policy.mailer_rw,
  ]

  lifecycle {
    # Imported zip from CloudFormation; avoid needless republish on every plan.
    ignore_changes = [filename, source_code_hash]
  }
}

resource "aws_lambda_permission" "mailer_s3" {
  statement_id   = "successfulsuccess-reports-MailerS3Permission-Z8V2E0Wwbual"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.mailer.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.reports.arn
  source_account = local.account_id
}

resource "aws_s3_bucket_notification" "reports" {
  bucket = aws_s3_bucket.reports.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.mailer.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "reports/"
    filter_suffix       = ".csv"
  }

  depends_on = [aws_lambda_permission.mailer_s3]
}
