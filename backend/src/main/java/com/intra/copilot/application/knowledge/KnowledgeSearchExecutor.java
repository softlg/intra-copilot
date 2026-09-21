package com.intra.copilot.application.knowledge;

import jakarta.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Bounded fan-out for independent knowledge-base searches. */
@Component
public class KnowledgeSearchExecutor {
    private final ExecutorService executor;

    public KnowledgeSearchExecutor(
            @Value("${rag.search-concurrency:4}") int concurrency) {
        this.executor =
                Executors.newFixedThreadPool(
                        Math.max(1, Math.min(16, concurrency)),
                        runnable -> {
                            Thread thread =
                                    new Thread(runnable, "knowledge-search-" + runnable.hashCode());
                            thread.setDaemon(true);
                            return thread;
                        });
    }

    public <T> List<T> mapOrdered(List<String> values, Function<String, T> operation) {
        List<Future<T>> futures = new ArrayList<>(values.size());
        for (String value : values) {
            Callable<T> task = () -> operation.apply(value);
            futures.add(executor.submit(task));
        }
        List<T> results = new ArrayList<>(futures.size());
        for (Future<T> future : futures) {
            try {
                results.add(future.get());
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("知识库检索被中断", error);
            } catch (ExecutionException error) {
                Throwable cause = error.getCause() == null ? error : error.getCause();
                if (cause instanceof RuntimeException runtime) throw runtime;
                throw new IllegalStateException("知识库检索失败", cause);
            }
        }
        return results;
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }
}
