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
