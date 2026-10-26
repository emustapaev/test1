# Пакет: каталог lead/ кладётся в корень zip (импорты вида `from lead import ...`).
# boto3 входит в рантайм Lambda и в архив не попадает.
data "archive_file" "lead" {
  type        = "zip"
  output_path = "${path.module}/.build/lead.zip"

  dynamic "source" {
    for_each = fileset("${path.module}/../../apps/api/lead", "*.py")
    content {
      content  = file("${path.module}/../../apps/api/lead/${source.value}")
      filename = "lead/${source.value}"
    }
  }
}

resource "aws_cloudwatch_log_group" "lead" {
  name              = "/aws/lambda/${local.lambda_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "lead" {
  function_name    = local.lambda_name
  role             = aws_iam_role.lead.arn
  runtime          = "python3.12"
  handler          = "lead.handler.lambda_handler"
  filename         = data.archive_file.lead.output_path
  source_code_hash = data.archive_file.lead.output_base64sha256
  timeout          = 10
  memory_size      = 128

  environment {
    variables = {
      LEAD_RECIPIENT_EMAIL = var.lead_recipient_email
      LEAD_FROM_EMAIL      = var.lead_from_email
      LOG_LEVEL            = "INFO"
    }
  }

  depends_on = [aws_cloudwatch_log_group.lead, aws_iam_role_policy.lead]
}
