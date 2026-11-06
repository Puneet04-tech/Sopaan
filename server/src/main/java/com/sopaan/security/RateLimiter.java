package com.sopaan.security;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Small in-process token bucket. Free-tier boxes have 0.1 CPU, so a sync flood has to be
 * refused before it reaches the database (design 5.2.4: "rate limiting and body-size limits
 * on sync"). One bucket per caller key; the key is the authenticated subject, or the client
 * address when the call is unauthenticated.
 */
@Component
public class RateLimiter {

    public record Decision(boolean allowed, int remaining, long retryAfterSeconds) {
    }

    private static final class Bucket {
        final double capacity;
        final double refillPerSecond;
        double tokens;
        long updatedAt;

        Bucket(double capacity, double refillPerSecond) {
            this.capacity = capacity;
            this.refillPerSecond = refillPerSecond;
            this.tokens = capacity;
            this.updatedAt = System.nanoTime();
        }
    }

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final AtomicInteger calls = new AtomicInteger();

    public Decision check(String key, int capacity, double refillPerMinute) {
        long now = System.nanoTime();
        Bucket bucket = buckets.computeIfAbsent(key, ignored -> new Bucket(capacity, refillPerMinute / 60.0));
        synchronized (bucket) {
            double elapsed = (now - bucket.updatedAt) / 1_000_000_000.0;
            bucket.updatedAt = now;
            bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillPerSecond);
            if (bucket.tokens >= 1.0) {
                bucket.tokens -= 1.0;
                if (calls.incrementAndGet() % 4096 == 0) prune(now);
                return new Decision(true, (int) Math.floor(bucket.tokens), 0);
            }
            double deficit = 1.0 - bucket.tokens;
            long retry = (long) Math.ceil(deficit / Math.max(bucket.refillPerSecond, 0.0001));
            return new Decision(false, 0, Math.max(retry, 1));
        }
    }

    /** Drop buckets that have been idle long enough to be full again; keeps the map small. */
    private void prune(long now) {
        buckets.entrySet().removeIf(entry -> {
            Bucket bucket = entry.getValue();
            synchronized (bucket) {
                double elapsed = (now - bucket.updatedAt) / 1_000_000_000.0;
                return elapsed * bucket.refillPerSecond >= bucket.capacity;
            }
        });
    }
}
