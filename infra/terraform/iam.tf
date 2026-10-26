data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lead" {
  name                 = "${local.lambda_name}-role"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume.json
  permissions_boundary = var.permissions_boundary_arn
}

data "aws_iam_policy_document" "lead" {
  statement {
    sid       = "SendLeadEmail"
    actions   = ["ses:SendEmail"]
    resources = [aws_sesv2_email_identity.domain.arn]
  }

  statement {
    sid       = "OwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.lead.arn}:*"]
  }
}

resource "aws_iam_role_policy" "lead" {
  name   = "${local.lambda_name}-policy"
  role   = aws_iam_role.lead.id
  policy = data.aws_iam_policy_document.lead.json
}
