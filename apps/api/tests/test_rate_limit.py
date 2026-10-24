from app.rate_limit import RateLimiter, ip_key


def test_ip_key_is_sha256():
    assert len(ip_key("1.2.3.4")) == 64 and "1.2.3.4" not in ip_key("1.2.3.4")


def test_sliding_window():
    rl = RateLimiter(2, 60)
    assert rl.allow("a", now=0)
    assert rl.allow("a", now=30)
    assert not rl.allow("a", now=59)
    assert rl.allow("a", now=61)  # первое попадание вышло из окна
    assert not rl.allow("a", now=62)


def test_ips_independent():
    rl = RateLimiter(1, 60)
    assert rl.allow("a", now=0)
    assert rl.allow("b", now=0)
    assert not rl.allow("a", now=1)
