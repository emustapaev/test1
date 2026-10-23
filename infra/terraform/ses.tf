# Domain identity с DKIM (Easy DKIM). CNAME-записи добавляются вручную в ClouDNS.
resource "aws_sesv2_email_identity" "domain" {
  email_identity = var.domain_name

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# Получатель: пока аккаунт в SES sandbox, адрес назначения должен быть верифицирован
# (SES отправит письмо со ссылкой подтверждения).
resource "aws_sesv2_email_identity" "recipient" {
  email_identity = var.lead_to_email
}
