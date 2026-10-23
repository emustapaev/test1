resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "krunai-site-${var.environment}"
  description                       = "OAC для приватного S3-бакета сайта"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ADR 0003: редирект `/` по локали и переписывание путей на index.html
resource "aws_cloudfront_function" "locale_router" {
  name    = "krunai-locale-router-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "Locale detection for / and index.html rewrite (ADR 0003)"
  publish = true
  code    = file("${path.module}/../functions/locale-router.js")
}

# HTML: короткий TTL (как в v1: no-cache на стороне браузера, быстрая актуализация на edge)
resource "aws_cloudfront_cache_policy" "html" {
  name        = "krunai-html-${var.environment}"
  comment     = "HTML: короткий TTL"
  min_ttl     = 0
  default_ttl = 60
  max_ttl     = 300

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# /_next/static/*: имена с хэшем, кэшируем год
resource "aws_cloudfront_cache_policy" "static_immutable" {
  name        = "krunai-static-immutable-${var.environment}"
  comment     = "Хэшированные ассеты: долгий TTL"
  min_ttl     = 31536000
  default_ttl = 31536000
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "krunai-security-headers-${var.environment}"
  comment = "HSTS, nosniff, X-Frame-Options, Referrer-Policy, базовый CSP"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    content_security_policy {
      content_security_policy = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
      override                = true
    }
  }
}

locals {
  s3_origin_id = "site-s3"
}

resource "aws_cloudfront_distribution" "site" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "krunai.uz static site (${var.environment})"
  aliases         = local.aliases
  price_class     = "PriceClass_100"
  http_version    = "http2and3"

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id           = local.s3_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.html.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.locale_router.arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/_next/static/*"
    target_origin_id           = local.s3_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.static_immutable.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  # Точка расширения для T14: сюда добавится origin API и ordered_cache_behavior "/api/*".

  # ADR 0002: единая локализованная 404 (S3 за OAC без ListBucket отдаёт 403 для отсутствующих ключей)
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/en/404/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/en/404/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
