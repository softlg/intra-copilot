package com.intra.copilot.service;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Sliding-window limiter for outbound embedding calls.
 *
 * <p>Providers answer 429 long before the JVM runs out of memory, and an unbounded
 * fan-out during a base rebuild turns a slow job into a failed one. Queue draining is
 * mostly serial anyway, so this only has to smooth out bursts.
 */
@Component
public class EmbeddingRateLimiter {

    private static final int DEFAULT_QPS = 60;

    private final Environment environment;
    private final Map<String, Deque<Long>> windows = new ConcurrentHashMap<>();

    public EmbeddingRateLimiter(Environment environment) {
        this.environment = environment;
    }

    public void acquire(String provider) {
        int qps = qpsFor(provider);
        if (qps <= 0) return;
        Deque<Long> window = windows.computeIfAbsent(provider == null ? "default" : provider, key -> new ArrayDeque<>());
        synchronized (window) {
            long now = System.currentTimeMillis();
            while (window.size() >= qps) {
                long sleepFor = 1000 - (now - window.peekFirst());
                if (sleepFor <= 0) {
                    window.pollFirst();
                    now = System.currentTimeMillis();
                    continue;
                }
                try {
                    Thread.sleep(sleepFor);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
                now = System.currentTimeMillis();
                while (!window.isEmpty() && now - window.peekFirst() >= 1000) window.pollFirst();
            }
            window.addLast(now);
        }
    }

    public int qpsFor(String provider) {
        if (provider == null || provider.isBlank()) return DEFAULT_QPS;
        return environment.getProperty("embedding.providers." + provider + ".qps", Integer.class, DEFAULT_QPS);
    }
}
