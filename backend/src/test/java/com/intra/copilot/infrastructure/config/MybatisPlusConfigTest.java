package com.intra.copilot.infrastructure.config;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;
import org.junit.jupiter.api.Test;

class MybatisPlusConfigTest {

    @Test
    void registersOptimisticLockerInterceptor() {
        var interceptor = new MybatisPlusConfig().mybatisPlusInterceptor();

        assertTrue(
                interceptor
                        .getInterceptors()
                        .stream()
                        .anyMatch(OptimisticLockerInnerInterceptor.class::isInstance));
    }
}
