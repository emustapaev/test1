# Rate limit заявок: счётчик по хэшу IP, запись живёт окно лимита и удаляется по TTL
resource "aws_dynamodb_table" "rate_limit" {
  name         = "krunai-lead-rate-limit-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}
