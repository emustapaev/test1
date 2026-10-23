locals {
  allowed_origins = ["https://${var.domain_name}", "https://${local.www_domain_name}"]
}

resource "aws_cloudwatch_log_group" "lead_lambda" {
  name              = "/aws/lambda/krunai-lead-${var.environment}"
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
    sid       = "SendEmail"
    actions   = ["ses:SendEmail"]
    resources = [aws_sesv2_email_identity.domain.arn]

    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [var.lead_from_email]
    }
  }

  statement {
    sid       = "RateLimit"
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
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

  # Артефакт собирает `npm run build -w apps/api` (apps/api/dist/lambda.zip)
  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  # v1: reserved concurrency ≤ 5
  reserved_concurrent_executions = 5

  environment {
    variables = {
      LEAD_RECIPIENT_EMAIL      = var.lead_recipient_email
      LEAD_FROM_EMAIL           = var.lead_from_email
      RATE_LIMIT_TABLE          = aws_dynamodb_table.rate_limit.name
      RATE_LIMIT_MAX            = "5"
      RATE_LIMIT_WINDOW_SECONDS = "600"
      ALLOWED_ORIGIN            = join(",", local.allowed_origins)
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lead_lambda,
    aws_iam_role_policy.lead_lambda,
  ]
}

