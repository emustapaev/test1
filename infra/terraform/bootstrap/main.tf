# Bootstrap: OIDC-провайдер GitHub и роль деплоя для GitHub Actions.
# Применяется ОДИН раз локально администратором AWS клиента (state локальный, не коммитится).
# Бакет state и таблица блокировок основного стека создаются вне Terraform (см. docs/deploy.md).
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "krunai"
      ManagedBy = "terraform-bootstrap"
    }
  }
}

variable "region" {
  description = "Регион основного стека"
  type        = string
  default     = "eu-west-3"
}

variable "github_repo" {
  description = "Репозиторий GitHub (owner/name), которому разрешено assume роли"
  type        = string
  default     = "emustapaev/test1"
}

variable "github_environment" {
  description = "GitHub environment, для которого также разрешён assume"
  type        = string
  default     = "production"
}

variable "create_oidc_provider" {
  description = "Создать OIDC-провайдер GitHub. false — если он уже есть в аккаунте (он единственный на URL)"
  type        = bool
  default     = true
}

variable "state_bucket" {
  description = "Имя S3-бакета с Terraform state"
  type        = string
  default     = "krunai-terraform-state"
}

variable "lock_table" {
  description = "Имя DynamoDB-таблицы блокировок state"
  type        = string
  default     = "krunai-terraform-locks"
}

variable "role_name" {
  description = "Имя роли деплоя"
  type        = string
  default     = "krunai-github-deploy"
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  oidc_url   = "token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url            = "https://${local.oidc_url}"
  client_id_list = ["sts.amazonaws.com"]
  # AWS валидирует цепочку доверенных CA сам; thumbprint формально обязателен для провайдера
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${local.account_id}:oidc-provider/${local.oidc_url}"
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:sub"
      values = [
        "repo:${var.github_repo}:ref:refs/heads/main",
        "repo:${var.github_repo}:environment:${var.github_environment}",
      ]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = var.role_name
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = 3600
}

# Права ограничены сервисами, которыми управляет основной стек (infra/terraform).
# Ресурсы сужены по префиксу имён там, где Terraform сам задаёт имена; иначе — по сервису.
data "aws_iam_policy_document" "deploy" {
  statement {
    sid     = "TerraformState"
    actions = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [
      "arn:aws:s3:::${var.state_bucket}",
    ]
  }

  statement {
    sid       = "TerraformStateObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::${var.state_bucket}/*"]
  }

  statement {
    sid       = "TerraformLock"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:DescribeTable"]
    resources = ["arn:aws:dynamodb:${var.region}:${local.account_id}:table/${var.lock_table}"]
  }

  statement {
    sid = "Services"
    actions = [
      "s3:*",
      "cloudfront:*",
      "acm:*",
      "apigateway:*",
      "lambda:*",
      "dynamodb:*",
      "ses:*",
      "sns:*",
      "cloudwatch:*",
      "logs:*",
    ]
    resources = ["*"]
  }

  statement {
    sid = "ServiceRoles"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:UpdateRole", "iam:PassRole",
      "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags",
      "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy",
      "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:UpdateAssumeRolePolicy",
    ]
    resources = ["arn:aws:iam::${local.account_id}:role/krunai-*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
