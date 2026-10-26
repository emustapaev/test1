output "site_bucket_name" {
  description = "Имя S3-бакета со статикой сайта"
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "ID дистрибуции CloudFront (для инвалидации)"
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  description = "Доменное имя дистрибуции *.cloudfront.net (цель ALIAS/CNAME)"
  value       = aws_cloudfront_distribution.site.domain_name
}

output "acm_validation_records" {
  description = "CNAME-записи для DNS-валидации ACM (без завершающей точки); добавить вручную в ClouDNS"
  value = [
    for o in aws_acm_certificate.site.domain_validation_options : {
      name  = trimsuffix(o.resource_record_name, ".")
      type  = o.resource_record_type
      value = trimsuffix(o.resource_record_value, ".")
    }
  ]
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

output "api_endpoint" {
  description = "URL API (POST <api_endpoint>/contact)"
  value       = aws_apigatewayv2_api.lead.api_endpoint
}

output "site_url" {
  description = "Адрес сайта: *.cloudfront.net на этапе 1, https://krunai.uz после enable_custom_domain"
  value       = var.enable_custom_domain ? "https://${var.domain_name}" : local.cloudfront_url
}

# Все записи разд. 6 ТЗ; записи Zoho (корневые MX/SPF/DMARC) не включены.
output "dns_records" {
  description = "DNS-записи для ClouDNS: name — полные имена в зоне"
  value = concat(
    [
      for o in aws_acm_certificate.site.domain_validation_options : {
        type    = o.resource_record_type
        name    = trimsuffix(o.resource_record_name, ".")
        value   = trimsuffix(o.resource_record_value, ".")
        purpose = "подтверждение SSL-сертификата"
      }
    ],
    [
      {
        type    = "ALIAS"
        name    = var.domain_name
        value   = aws_cloudfront_distribution.site.domain_name
        purpose = "основной домен сайта"
      },
      {
        type    = "CNAME"
        name    = local.www_domain_name
        value   = aws_cloudfront_distribution.site.domain_name
        purpose = "адрес www (перенаправляется на основной)"
      },
    ],
    [
      for t in aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens : {
        type    = "CNAME"
        name    = "${t}._domainkey.${var.domain_name}"
        value   = "${t}.dkim.amazonses.com"
        purpose = "подпись писем (DKIM)"
      }
    ],
    [
      {
        type    = "MX"
        name    = aws_sesv2_email_identity_mail_from_attributes.domain.mail_from_domain
        value   = "10 feedback-smtp.${data.aws_region.current.name}.amazonses.com"
        purpose = "обратный адрес писем формы (MAIL FROM)"
      },
      {
        type    = "TXT"
        name    = aws_sesv2_email_identity_mail_from_attributes.domain.mail_from_domain
        value   = "v=spf1 include:amazonses.com ~all"
        purpose = "SPF для писем формы"
      },
    ],
  )
}
