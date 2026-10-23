output "site_bucket_name" {
  description = "Имя S3-бакета со статикой сайта"
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "ID дистрибуции CloudFront (для инвалидации)"
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  description = "Доменное имя дистрибуции *.cloudfront.net"
  value       = aws_cloudfront_distribution.site.domain_name
}

output "cloudfront_distribution_arn" {
  description = "ARN дистрибуции CloudFront"
  value       = aws_cloudfront_distribution.site.arn
}
