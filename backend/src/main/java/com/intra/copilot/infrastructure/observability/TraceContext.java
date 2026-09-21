package com.intra.copilot.infrastructure.observability;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.MDC;

/**
 * Request-scoped trace identity shared by persistence, SSE and application logs.
 *
 * <p>Chat work runs on a dedicated worker thread, so a ThreadLocal is sufficient while the explicit
 * values copied into each SSE envelope keep the observable identity consistent in the browser.
 */
public final class TraceContext {
    private static final ThreadLocal<Values> CURRENT = new ThreadLocal<>();

    private TraceContext() {}

    public static void open(
            String traceId, String turnId, Integer attemptNo, String requestId, String spanId) {
        Values values = new Values(traceId, turnId, attemptNo, requestId, spanId);
        CURRENT.set(values);
        writeMdc(values);
    }

    public static Values current() {
        return CURRENT.get();
    }

    public static void setSpanId(String spanId) {
        Values values = CURRENT.get();
        if (values == null) {
            return;
        }
        Values next =
                new Values(
                        values.traceId(),
                        values.turnId(),
                        values.attemptNo(),
                        values.requestId(),
                        spanId);
        CURRENT.set(next);
        writeMdc(next);
    }

    public static String traceId() {
        Values values = CURRENT.get();
        return values == null ? null : values.traceId();
    }

    public static String turnId() {
        Values values = CURRENT.get();
        return values == null ? null : values.turnId();
    }

    public static Integer attemptNo() {
        Values values = CURRENT.get();
        return values == null ? null : values.attemptNo();
    }

    public static String spanId() {
        Values values = CURRENT.get();
        return values == null ? null : values.spanId();
    }

    /**
     * Wraps an SSE data object without changing its existing keys. Plugin clients can keep reading
     * {@code data.text}/{@code data.key}; operators additionally receive trace identity on every
     * event.
     */
    public static Map<String, Object> eventData(Map<String, ?> value) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (value != null) {
            value.forEach(result::put);
        }
        Values values = CURRENT.get();
        if (values != null) {
            result.put("traceId", values.traceId());
            result.put("turnId", values.turnId());
            result.put("attemptNo", values.attemptNo());
            result.put("requestId", values.requestId());
            result.put("spanId", values.spanId());
        }
        return result;
    }

    public static void clear() {
        CURRENT.remove();
        MDC.remove("traceId");
        MDC.remove("turnId");
        MDC.remove("attemptNo");
        MDC.remove("requestId");
        MDC.remove("spanId");
    }

    private static void writeMdc(Values values) {
        put("traceId", values.traceId());
        put("turnId", values.turnId());
        put("attemptNo", values.attemptNo());
        put("requestId", values.requestId());
        put("spanId", values.spanId());
    }

    private static void put(String key, Object value) {
        if (value == null) {
            MDC.remove(key);
        } else {
            MDC.put(key, String.valueOf(value));
        }
    }

    public record Values(
            String traceId, String turnId, Integer attemptNo, String requestId, String spanId) {}
}
