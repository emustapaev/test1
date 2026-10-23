output "deploy_role_arn" {
  description = "ARN роли деплоя: записать в GitHub variable AWS_DEPLOY_ROLE_ARN"
  value       = aws_iam_role.deploy.arn
}
