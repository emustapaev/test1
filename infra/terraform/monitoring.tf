resource "aws_sns_topic" "alerts" {
  name = "alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  count = var.alarm_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "ses_bounce_rate" {
  alarm_name          = "krunai-ses-bounce-rate-${var.environment}"
  alarm_description   = "SES Reputation.BounceRate >= 5%"
  namespace           = "AWS/SES"
  metric_name         = "Reputation.BounceRate"
  statistic           = "Maximum"
  period              = 900
  evaluation_periods  = 1
  threshold           = 0.05
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "ses_complaint_rate" {
  alarm_name          = "krunai-ses-complaint-rate-${var.environment}"
  alarm_description   = "SES Reputation.ComplaintRate >= 0.1%"
  namespace           = "AWS/SES"
  metric_name         = "Reputation.ComplaintRate"
  statistic           = "Maximum"
  period              = 900
  evaluation_periods  = 1
  threshold           = 0.001
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${local.name_prefix}-lead-errors"
  alarm_description   = "Lambda ${local.lambda_name}: Errors > 0"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.lead.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "${local.name_prefix}-lead-throttles"
  alarm_description   = "Lambda ${local.lambda_name}: Throttles > 0"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.lead.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.name_prefix}-api-5xx"
  alarm_description   = "API Gateway HTTP API: 5xx > 0"
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = aws_apigatewayv2_api.lead.id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
