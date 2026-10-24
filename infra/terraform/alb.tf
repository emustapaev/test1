resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
}

resource "aws_lb_target_group" "web" {
  name        = "${var.project_name}-tg-web"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    path    = "/"
    matcher = "200"
  }
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-tg-api"
  port        = 8000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    path    = "/api/health"
    matcher = "200"
  }
}

# Listener 80: этап 1 — forward, этап 2 — редирект на HTTPS канонического хоста.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.enable_https ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.web.arn
    }
  }

  dynamic "default_action" {
    for_each = var.enable_https ? [1] : []
    content {
      type = "redirect"
      redirect {
        status_code = "HTTP_301"
        protocol    = "HTTPS"
        port        = "443"
        host        = var.canonical_host
        path        = "/#{path}"
        query       = "#{query}"
      }
    }
  }
}

resource "aws_lb_listener_rule" "http_api" {
  count = var.enable_https ? 0 : 1

  listener_arn = aws_lb_listener.http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}

resource "aws_lb_listener" "https" {
  count = var.enable_https ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.site[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

# Любой хост, кроме канонического (www.krunai.uz → krunai.uz или наоборот), редиректится на канонический.
resource "aws_lb_listener_rule" "https_canonical" {
  count = var.enable_https ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 10

  action {
    type = "redirect"
    redirect {
      status_code = "HTTP_301"
      protocol    = "HTTPS"
      port        = "443"
      host        = var.canonical_host
      path        = "/#{path}"
      query       = "#{query}"
    }
  }

  condition {
    host_header {
      values = [var.canonical_host == var.domain_name ? local.www_domain_name : var.domain_name]
    }
  }
}

resource "aws_lb_listener_rule" "https_api" {
  count = var.enable_https ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}
