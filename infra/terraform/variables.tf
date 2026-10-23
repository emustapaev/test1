variable "domain_name" {
  description = "Apex-домен сайта"
  type        = string
  default     = "krunai.uz"
}

variable "environment" {
  description = "Имя окружения (prod, staging, ...)"
  type        = string
  default     = "prod"
}

locals {
  www_domain_name = "www.${var.domain_name}"
  aliases         = [var.domain_name, local.www_domain_name]

  tags = {
    Project     = "krunai"
    ManagedBy   = "terraform"
    Environment = var.environment
  }
}

variable "lead_to_email" {
  description = "Получатель заявок (в SES sandbox должен быть верифицирован)"
  type        = string
  default     = "ernazar.mustapaev@gmail.com"
}

variable "lead_from_email" {
  description = "Адрес отправителя писем (должен принадлежать domain identity)"
  type        = string
  default     = "noreply@krunai.uz"
}

variable "log_retention_days" {
  description = "Срок хранения логов Lambda и API Gateway, дней (v1: 30)"
  type        = number
  default     = 30
}

variable "lead_api_throttle_rate" {
  description = "Throttling HTTP API: запросов в секунду (v1)"
  type        = number
  default     = 5
}

variable "lead_api_throttle_burst" {
  description = "Throttling HTTP API: burst (v1)"
  type        = number
  default     = 10
}
