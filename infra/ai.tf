resource "aws_cloudwatch_log_group" "parser" {
  name              = "/aws/lambda/${var.project_name}-agenda-parser"
  # Bumped 14 > 30 to prove a reviewed infra change (HCP apply after merge).
  retention_in_days = 90
}

resource "aws_iam_role" "parser" {
  name = "${var.project_name}-agenda-parser-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "parser_basic" {
  role       = aws_iam_role.parser.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "parser_bedrock" {
  name = "bedrock-runtime-invoke"
  role = aws_iam_role.parser.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
      ]
      Resource = "*"
    }]
  })
}

resource "aws_lambda_function" "parser" {
  function_name = "${var.project_name}-agenda-parser"
  description   = "Parses pasted agenda text with Claude on Bedrock Runtime"
  role          = aws_iam_role.parser.arn
  package_type  = "Image"
  image_uri     = local.image_uri
  architectures = [var.architecture]
  memory_size   = 1024
  timeout       = 60

  image_config {
    command = ["app.ai.agenda_lambda.handler"]
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.parser.name
  }

  environment {
    variables = {
      PARSER_MODEL         = var.parser_model
      COGNITO_REGION       = var.region
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
      COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.web.id
      CORS_ORIGINS         = "https://d1f03icpsr7l8b.cloudfront.net,http://localhost:3000"
      LOG_LEVEL            = "INFO"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.parser,
    aws_iam_role_policy_attachment.parser_basic,
    aws_iam_role_policy.parser_bedrock,
  ]

  lifecycle {
    ignore_changes = [environment]
  }
}

resource "aws_lambda_function_url" "parser" {
  function_name      = aws_lambda_function.parser.function_name
  authorization_type = "NONE"
  invoke_mode        = "BUFFERED"

  cors {
    allow_credentials = false
    allow_headers     = ["authorization", "content-type"]
    allow_methods     = ["POST"]
    allow_origins     = local.cors_origins
    max_age           = 86400
  }
}

resource "aws_lambda_permission" "parser_url" {
  statement_id           = "successfulsuccess-ai-ParserFunctionUrlPermission-VAW5HarjtIu9"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.parser.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "parser_url_invoke" {
  statement_id             = "successfulsuccess-ai-ParserFunctionUrlInvokePermission-hU7OuGuIYwHK"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.parser.function_name
  principal                = "*"
  invoked_via_function_url = true
}

resource "aws_budgets_budget" "monthly" {
  name         = "${var.project_name}-monthly-5usd"
  budget_type  = "COST"
  limit_amount = "5"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
