"""A sliding window rate limit, counted in memory.

Counts are kept per key (for example a client IP) in this process only, so
they reset when the API restarts, and several instances would each keep
their own counts. That's fine on Render's free plan, which runs one
instance; several instances would need a shared store such as Redis.
"""
import math
import threading
import time
from collections import deque
from collections.abc import Callable

# Above this many keys, keys with no recent hits are dropped, so the memory
# used stays small however many different clients call
_SWEEP_ABOVE = 10_000


class SlidingWindowLimit:
    def __init__(self, limit: Callable[[], int], window_seconds: float, clock: Callable[[], float] = time.monotonic):
        # limit is read on every hit, so a changed setting applies at once
        self._limit = limit
        self._window = window_seconds
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()  # sync endpoints run in a thread pool

    def hit(self, key: str) -> int | None:
        """Count a hit for key. None if it's allowed; otherwise the seconds
        until the next one would be (for a Retry-After header), and the hit
        isn't counted."""
        now = self._clock()
        with self._lock:
            if len(self._hits) > _SWEEP_ABOVE:
                self._sweep(now)
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - self._window:
                hits.popleft()
            if len(hits) >= self._limit():
                return max(1, math.ceil(hits[0] + self._window - now))
            hits.append(now)
            return None

    def _sweep(self, now: float) -> None:
        for key in [k for k, hits in self._hits.items() if not hits or hits[-1] <= now - self._window]:
            del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
