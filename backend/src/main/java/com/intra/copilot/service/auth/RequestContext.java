package com.intra.copilot.service.auth;

/**
 * 当前请求的身份上下文，通过 JwtAuthFilter 注入，请求结束清理。
 * Controller 与 Service 通过 RequestContext.current() 拿到当前 source + userId。
 */
public final class RequestContext {

    private static final ThreadLocal<Identity> CURRENT = new ThreadLocal<>();

    private RequestContext() {}

    public static void set(String source, String userId) {
        CURRENT.set(new Identity(source, userId));
    }

    /** 绑定已有身份；传 null 表示清空（例如匿名线程）。 */
    public static void set(Identity identity) {
        if (identity == null) CURRENT.remove();
        else CURRENT.set(identity);
    }

    public static void clear() {
        CURRENT.remove();
    }

    /** 未绑定身份时返回 null（区别于 {@link #currentOrAnonymous()} 的匿名兜底）。 */
    public static Identity currentOrNull() {
        return CURRENT.get();
    }

    /**
     * 在指定身份下执行任务，结束后恢复原绑定。
     * 用于把请求线程的身份显式带入异步线程——ThreadLocal 不会跨线程，
     * 而 SseEmitter 的生成循环是在自建线程里跑的。
     */
    public static void runWith(Identity identity, Runnable task) {
        Identity previous = CURRENT.get();
        try {
            set(identity);
            task.run();
        } finally {
            set(previous);
        }
    }

    public static Identity current() {
        Identity value = CURRENT.get();
        if (value == null) {
            throw new IllegalStateException("No identity bound to current thread; auth filter not applied?");
        }
        return value;
    }

    public static Identity currentOrAnonymous() {
        Identity value = CURRENT.get();
        return value != null ? value : new Identity("anonymous", "anonymous");
    }

    public record Identity(String source, String userId) {}
}
