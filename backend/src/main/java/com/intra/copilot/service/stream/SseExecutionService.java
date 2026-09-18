package com.intra.copilot.service.stream;

import com.intra.copilot.service.auth.RequestContext;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Bounded execution and shared keep-alive scheduling for all SSE-backed workloads. */
@Service
public class SseExecutionService {
    private final ThreadPoolExecutor executor;
    private final ScheduledExecutorService heartbeats;
    private final long heartbeatSeconds;

    public SseExecutionService(
            @Value("${app.stream.core-threads:4}") int coreThreads,
            @Value("${app.stream.max-threads:16}") int maxThreads,
            @Value("${app.stream.queue-capacity:200}") int queueCapacity,
            @Value("${app.stream.heartbeat-seconds:15}") long heartbeatSeconds) {
        int core = Math.max(1, coreThreads);
        int max = Math.max(core, maxThreads);
        this.executor =
                new ThreadPoolExecutor(
                        core,
                        max,
                        60L,
                        TimeUnit.SECONDS,
                        new ArrayBlockingQueue<>(Math.max(1, queueCapacity)),
                        namedFactory("chat-stream-"),
                        new ThreadPoolExecutor.AbortPolicy());
        this.executor.allowCoreThreadTimeOut(true);
        this.heartbeats =
                java.util.concurrent.Executors.newScheduledThreadPool(
                        1, namedFactory("sse-heartbeat-"));
        this.heartbeatSeconds = Math.max(5L, Math.min(120L, heartbeatSeconds));
    }

    public void execute(Runnable task) {
        if (executor.isShutdown()) throw new RejectedExecutionException("流式执行器已关闭");
        executor.execute(task);
    }

    public void executeWithIdentity(RequestContext.Identity identity, Runnable task) {
        execute(() -> RequestContext.runWith(identity, task));
    }

    public ScheduledFuture<?> startHeartbeat(SseEmitter emitter, AtomicBoolean finished) {
        return heartbeats.scheduleAtFixedRate(
                () -> {
                    if (finished.get()) return;
                    try {
                        emitter.send(SseEmitter.event().comment("keep-alive"));
                    } catch (IOException | IllegalStateException error) {
                        finished.set(true);
                    }
                },
                heartbeatSeconds,
                heartbeatSeconds,
                TimeUnit.SECONDS);
    }

    public int activeCount() {
        return executor.getActiveCount();
    }

    public int queuedCount() {
        return executor.getQueue().size();
    }

    @PreDestroy
    public void shutdown() {
        heartbeats.shutdownNow();
        executor.shutdownNow();
    }

    private static java.util.concurrent.ThreadFactory namedFactory(String prefix) {
        AtomicInteger sequence = new AtomicInteger();
        return runnable -> {
            Thread thread = new Thread(runnable, prefix + sequence.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
    }
}
