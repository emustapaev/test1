resource "aws_acm_certificate" "site" {
  domain_name               = var.domain_name
  subject_alternative_names = [local.www_domain_name]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Этап 2 (enable_https = true): ждём выпуска сертификата после добавления CNAME в ClouDNS.
# На этапе 1 ресурса нет, поэтому деплой не ждёт DNS.
resource "aws_acm_certificate_validation" "site" {
  count = var.enable_https ? 1 : 0

  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for o in aws_acm_certificate.site.domain_validation_options : o.resource_record_name]

  timeouts {
    create = "30m"
  }
}
