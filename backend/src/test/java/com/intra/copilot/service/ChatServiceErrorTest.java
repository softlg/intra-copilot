package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.Test;

class ChatServiceErrorTest {

    @Test
    void classifiesReactorBlockingTimeoutAsModelTimeout() {
        IllegalStateException error =
                new IllegalStateException(
                        "Timeout on blocking read for 60000000000 NANOSECONDS",
                        new TimeoutException("timeout"));

        ChatService.LoopError result = ChatService.classifyLoopError(error);

        assertEquals("MODEL_TIMEOUT", result.code());
        assertEquals("模型响应超时，请稍后重试。", result.userMessage());
    }

    @Test
    void hidesUnexpectedProviderDetailsFromUsers() {
        ChatService.LoopError result =
                ChatService.classifyLoopError(new IllegalStateException("provider stack detail"));

        assertEquals("MODEL_ERROR", result.code());
        assertEquals("模型服务暂时不可用，请稍后重试。", result.userMessage());
    }
}
