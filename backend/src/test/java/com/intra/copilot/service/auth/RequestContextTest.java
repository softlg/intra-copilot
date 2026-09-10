package com.intra.copilot.service.auth;

import static org.junit.jupiter.api.Assertions.*;

import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class RequestContextTest {

    @AfterEach
    void tearDown() {
        RequestContext.clear();
    }

    @Test
    void currentFailsWhenNothingBound() {
        assertThrows(IllegalStateException.class, RequestContext::current);
        assertNull(RequestContext.currentOrNull());
        assertEquals("anonymous", RequestContext.currentOrAnonymous().userId());
    }

    @Test
    void runWithPropagatesIdentityIntoAnotherThread() throws Exception {
        RequestContext.set("extension", "user-1");

        // 必须先在请求线程捕获身份，再带进子线程（在子线程里取必然是 null）。
        RequestContext.Identity captured = RequestContext.currentOrNull();
        assertNotNull(captured);

        AtomicReference<RequestContext.Identity> seen = new AtomicReference<>();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Thread worker = new Thread(() -> RequestContext.runWith(captured, () -> {
            try {
                seen.set(RequestContext.current());
            } catch (Throwable error) {
                failure.set(error);
            }
        }));
        worker.start();
        worker.join();
        assertNull(failure.get(), () -> String.valueOf(failure.get()));

        assertNotNull(seen.get());
        assertEquals("extension", seen.get().source());
        assertEquals("user-1", seen.get().userId());
        // 主线程绑定不受影响
        assertEquals("user-1", RequestContext.current().userId());
    }

    @Test
    void runWithRestoresPreviousBindingAndHandlesNull() throws Exception {
        RequestContext.set("extension", "outer");

        // 传入 null：任务内无身份，结束后恢复外层绑定
        RequestContext.runWith(null, () -> assertNull(RequestContext.currentOrNull()));
        assertEquals("outer", RequestContext.current().userId());

        // 嵌套：内层结束后回到外层而非空
        RequestContext.runWith(
                new RequestContext.Identity("admin", "inner"),
                () -> assertEquals("inner", RequestContext.current().userId()));
        assertEquals("outer", RequestContext.current().userId());
    }
}
