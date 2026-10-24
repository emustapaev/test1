output "alb_dns_name" {
  description = "DNS-имя ALB (цель для ALIAS/CNAME в ClouDNS)"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone ID ALB"
  value       = aws_lb.main.zone_id
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

output "ecr_web_repository_url" {
  description = "URL ECR-репозитория web"
  value       = aws_ecr_repository.app["web"].repository_url
}

output "ecr_api_repository_url" {
  description = "URL ECR-репозитория api"
  value       = aws_ecr_repository.app["api"].repository_url
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
