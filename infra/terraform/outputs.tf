output "site_bucket_name" {
  description = "Имя S3-бакета со статикой сайта"
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "ID дистрибуции CloudFront (для инвалидации)"
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  description = "Доменное имя дистрибуции *.cloudfront.net"
  value       = aws_cloudfront_distribution.site.domain_name
}

output "cloudfront_distribution_arn" {
  description = "ARN дистрибуции CloudFront"
  value       = aws_cloudfront_distribution.site.arn
}

output "acm_validation_records" {
  description = "CNAME-записи для DNS-валидации ACM (FQDN); добавить вручную в ClouDNS на этапе 1"
  value = [
    for o in aws_acm_certificate.site.domain_validation_options : {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ]
}

output "dns_records" {
  description = "Записи для ClouDNS: apex ALIAS и www CNAME на дистрибуцию CloudFront. Если ALIAS недоступен — fallback: канонический хост www.krunai.uz (canonical_host), apex — редирект/ANAME у регистратора"
  value = [
    {
      name  = "${var.domain_name}."
      type  = "ALIAS"
      value = aws_cloudfront_distribution.site.domain_name
    },
    {
      name  = "${local.www_domain_name}."
      type  = "CNAME"
      value = aws_cloudfront_distribution.site.domain_name
    },
  ]
}

output "api_endpoint" {
  description = "Базовый URL HTTP API заявок (прямой, в обход CloudFront)"
  value       = aws_apigatewayv2_api.lead.api_endpoint
}

output "lead_lambda_name" {
  description = "Имя Lambda-функции обработки заявок"
  value       = aws_lambda_function.lead.function_name
}

output "ses_dkim_records" {
  description = "DKIM CNAME для SES; добавить вручную в ClouDNS"
  value = [
    for t in aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens : {
      name  = "${t}._domainkey.${var.domain_name}"
      type  = "CNAME"
      value = "${t}.dkim.amazonses.com"
    }
  ]
}

output "ses_mail_from_records" {
  description = "MX и TXT (SPF) для MAIL FROM-поддомена SES; добавить вручную в ClouDNS"
  value = [
    {
      name  = aws_sesv2_email_identity_mail_from_attributes.domain.mail_from_domain
      type  = "MX"
      value = "10 feedback-smtp.${data.aws_region.current.name}.amazonses.com"
    },
    {
      name  = aws_sesv2_email_identity_mail_from_attributes.domain.mail_from_domain
      type  = "TXT"
      value = "v=spf1 include:amazonses.com ~all"
    },
  ]
}

output "ses_identity_arn" {
  description = "ARN domain identity SES"
  value       = aws_sesv2_email_identity.domain.arn
}

output "alerts_topic_arn" {
  description = "ARN SNS-топика alerts"
  value       = aws_sns_topic.alerts.arn
}

output "rate_limit_table_name" {
  description = "Имя DynamoDB-таблицы rate limit"
  value       = aws_dynamodb_table.rate_limit.name
}
