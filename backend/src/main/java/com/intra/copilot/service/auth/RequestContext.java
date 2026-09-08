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

    public static void clear() {
        CURRENT.remove();
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
