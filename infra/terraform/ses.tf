# Domain identity с Easy DKIM (RSA 2048). DNS-записи добавляются вручную в ClouDNS
# (см. outputs ses_dkim_records / ses_mail_from_records). Route 53 не используется,
# apex MX/SPF/DMARC (Zoho Mail) не затрагиваются. Регион SES — eu-west-3 (провайдер по умолчанию).
data "aws_region" "current" {}

resource "aws_sesv2_email_identity" "domain" {
  email_identity = var.domain_name

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# Custom MAIL FROM на поддомене: SPF/MX для Return-Path живут на mail.<домен>, apex не меняется.
resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity         = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain       = "${var.ses_mail_from_subdomain}.${var.domain_name}"
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}
