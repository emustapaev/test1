resource "aws_acm_certificate" "site" {
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = [local.www_domain_name]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "site" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for o in aws_acm_certificate.site.domain_validation_options : o.resource_record_name]

  # DNS живёт в ClouDNS: CNAME для валидации добавляются вручную (см. output acm_validation_records).
  # Ресурс ждёт выпуска сертификата, пока записи не появятся в DNS.
}
