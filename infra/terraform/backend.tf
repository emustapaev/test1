# Partial configuration: значения передаются через `terraform init -backend-config=backend.hcl`
# (см. backend.hcl.example). Бакет state и таблица блокировок создаются вне этого стека.
terraform {
  backend "s3" {}
}
