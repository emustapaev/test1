# Partial configuration: значения передаёт платформа (docs/platform-contract.md):
#   terraform init \
#     -backend-config="bucket=$TF_STATE_BUCKET" \
#     -backend-config="dynamodb_table=$TF_LOCK_TABLE" \
#     -backend-config="region=$AWS_REGION" \
#     -backend-config="key=test1/terraform.tfstate" \
#     -backend-config="encrypt=true"
terraform {
  backend "s3" {}
}
