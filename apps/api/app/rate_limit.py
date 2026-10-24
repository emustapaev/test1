import hashlib
import threading
import time
from collections import deque


def ip_key(ip: str) -> str:
    return hashlib.sha256(ip.encode()).hexdigest()


class RateLimiter:
    """In-memory sliding window limiter keyed by sha256(ip)."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, ip: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        key = ip_key(ip)
        cutoff = now - self.window_seconds
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self.max_requests:
                return False
            hits.append(now)
            # Не даём словарю расти бесконечно: чистим пустые ключи других IP.
            if len(self._hits) > 10_000:
                for k in [k for k, d in self._hits.items() if not d or d[-1] <= cutoff]:
                    del self._hits[k]
            return True
