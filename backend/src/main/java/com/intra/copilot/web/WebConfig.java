package com.intra.copilot.web;

import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Value("${app.cors-origins}")
    String origins;

    private final JwtAuthFilter jwtAuthFilter;

    public WebConfig(JwtAuthFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    public void addCorsMappings(CorsRegistry r) {
        r.addMapping("/**")
                .allowedOriginPatterns(
                        Arrays.stream(origins.split(","))
                                .map(String::trim)
                                .filter(origin -> !origin.isBlank())
                                .toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .exposedHeaders("Authorization")
                .maxAge(3600);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // JwtAuthFilter 内部按 path 前缀白名单判定是否需要鉴权
        registry.addInterceptor(jwtAuthFilter).addPathPatterns("/api/v1/**");
    }
}
