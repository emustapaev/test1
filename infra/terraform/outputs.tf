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

output "acm_validation_records" {
  description = "CNAME-записи для DNS-валидации ACM; добавить вручную в ClouDNS"
  value = [
    for o in aws_acm_certificate.site.domain_validation_options : {
      domain = o.domain_name
      name   = o.resource_record_name
      type   = o.resource_record_type
      value  = o.resource_record_value
    }
  ]
}

output "dns_records" {
  description = "Записи для ClouDNS: CNAME/ALIAS для krunai.uz и www на домен CloudFront"
  value = {
    for d in local.aliases : d => {
      type  = d == var.domain_name ? "ALIAS (или CNAME, если ClouDNS разрешает на apex)" : "CNAME"
      value = aws_cloudfront_distribution.site.domain_name
    }
  }
}
