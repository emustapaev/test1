data "archive_file" "lead_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../../apps/api/dist"
  output_path = "${path.module}/.build/lead-lambda.zip"
}

resource "aws_cloudwatch_log_group" "lead_lambda" {
  name              = "/aws/lambda/krunai-lead-${var.environment}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "lead_api" {
  name              = "/aws/apigateway/krunai-lead-${var.environment}"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lead_lambda" {
  name               = "krunai-lead-lambda-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lead_lambda" {
  statement {
    sid     = "SendEmail"
    actions = ["ses:SendEmail"]
    resources = [aws_sesv2_email_identity.domain.arn]
  }

  statement {
    sid       = "RateLimit"
    actions   = ["dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.rate_limit.arn]
  }

  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.lead_lambda.arn}:*"]
  }
}

resource "aws_iam_role_policy" "lead_lambda" {
  name   = "lead-lambda"
  role   = aws_iam_role.lead_lambda.id
  policy = data.aws_iam_policy_document.lead_lambda.json
}

resource "aws_lambda_function" "lead" {
  function_name = "krunai-lead-${var.environment}"
  role          = aws_iam_role.lead_lambda.arn
  runtime       = "nodejs20.x"
  handler       = "handler.handler"
  architectures = ["arm64"]
  timeout       = 10
  memory_size   = 256

  filename         = data.archive_file.lead_lambda.output_path
  source_code_hash = data.archive_file.lead_lambda.output_base64sha256

  # v1: reserved concurrency ≤ 5
  reserved_concurrent_executions = 5

  environment {
    variables = {
      LEAD_TO_EMAIL    = var.lead_to_email
      LEAD_FROM_EMAIL  = var.lead_from_email
      RATE_LIMIT_TABLE = aws_dynamodb_table.rate_limit.name
      ALLOWED_ORIGIN   = "https://${var.domain_name}"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lead_lambda,
    aws_iam_role_policy.lead_lambda,
  ]
}

resource "aws_apigatewayv2_api" "lead" {
  name          = "krunai-lead-${var.environment}"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lead" {
  api_id                 = aws_apigatewayv2_api.lead.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.lead.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "lead_post" {
  api_id    = aws_apigatewayv2_api.lead.id
  route_key = "POST /api/lead"
  target    = "integrations/${aws_apigatewayv2_integration.lead.id}"
}

# Обработчик сам отвечает на preflight
resource "aws_apigatewayv2_route" "lead_options" {
  api_id    = aws_apigatewayv2_api.lead.id
  route_key = "OPTIONS /api/lead"
  target    = "integrations/${aws_apigatewayv2_integration.lead.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.lead.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.lead_api_throttle_rate
    throttling_burst_limit = var.lead_api_throttle_burst
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.lead_api.arn
    # Без IP и тела запроса
    format = jsonencode({
      requestId = "$context.requestId"
      routeKey  = "$context.routeKey"
      status    = "$context.status"
      latency   = "$context.responseLatency"
    })
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowHttpApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lead.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.lead.execution_arn}/*/*"
}

# Алярм v1: ошибки Lambda > 0 за 5 минут
resource "aws_cloudwatch_metric_alarm" "lead_errors" {
  alarm_name          = "krunai-lead-errors-${var.environment}"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.lead.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
}
