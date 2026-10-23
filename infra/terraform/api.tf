resource "aws_cloudwatch_log_group" "lead_api" {
  name              = "/aws/apigateway/krunai-lead-${var.environment}"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_api" "lead" {
  name          = "krunai-lead-${var.environment}"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = local.allowed_origins
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["content-type"]
    max_age       = 600
  }
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
