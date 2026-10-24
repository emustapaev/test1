# Partial configuration: бакет, ключ и регион state передаёт платформа
# через `terraform init -backend-config=...` (см. docs/platform-contract.md).
terraform {
  backend "s3" {}
}
