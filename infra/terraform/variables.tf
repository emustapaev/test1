variable "project_name" {
  description = "Префикс имён ресурсов"
  type        = string
  default     = "krunai"
}

variable "aws_region" {
  description = "Регион AWS"
  type        = string
  default     = "eu-west-3"
}

variable "domain_name" {
  description = "Apex-домен сайта"
  type        = string
  default     = "krunai.uz"
}

variable "canonical_host" {
  description = "Канонический хост, на который редиректит ALB (www.krunai.uz — fallback при отсутствии ALIAS в ClouDNS)"
  type        = string
  default     = "krunai.uz"

  validation {
    condition     = contains(["krunai.uz", "www.krunai.uz"], var.canonical_host)
    error_message = "canonical_host должен быть krunai.uz или www.krunai.uz."
  }
}

variable "enable_https" {
  description = "Этап 2: ждать валидацию ACM и создать listener 443 с редиректами. Этап 1 (false): только HTTP 80, деплой не ждёт DNS"
  type        = bool
  default     = false
}

variable "web_image" {
  description = "Образ web (полный URI ECR с тегом)"
  type        = string
}

variable "api_image" {
  description = "Образ api (полный URI ECR с тегом)"
  type        = string
}

variable "lead_recipient_email" {
  description = "Получатель заявок; в SES sandbox должен быть верифицирован"
  type        = string
  default     = "gulmira@krunai.uz"
}

variable "lead_from_email" {
  description = "Адрес отправителя писем (должен принадлежать domain identity)"
  type        = string
  default     = "noreply@krunai.uz"
}

variable "ses_mail_from_subdomain" {
  description = "Поддомен MAIL FROM для SES (<поддомен>.<domain_name>)"
  type        = string
  default     = "mail"
}

variable "ses_verify_recipient" {
  description = "Верифицировать получателя заявок в SES (sandbox)"
  type        = bool
  default     = true
}

variable "alarm_email" {
  description = "Email для алертов (SNS); пусто — подписка не создаётся"
  type        = string
  default     = ""
}

variable "permissions_boundary_arn" {
  description = "ARN permissions boundary для IAM-ролей (TF_VAR_permissions_boundary_arn, выдаёт платформа)"
  type        = string
}

variable "environment" {
  description = "Имя окружения (prod, staging, ...)"
  type        = string
  default     = "prod"
}

locals {
  www_domain_name = "www.${var.domain_name}"

  tags = {
    Project     = var.project_name
    ManagedBy   = "terraform"
    Environment = var.environment
  }
}
