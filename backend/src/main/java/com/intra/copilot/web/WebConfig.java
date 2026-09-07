package com.intra.copilot.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;
import java.util.Arrays;

@Configuration
public class WebConfig implements WebMvcConfigurer {
  @Value("${app.cors-origins}")
  String origins;

  public void addCorsMappings(CorsRegistry r) {
    r.addMapping("/**")
        .allowedOriginPatterns(
            Arrays.stream(origins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isBlank())
                .toArray(String[]::new))
        .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
        .allowedHeaders("*")
        .maxAge(3600);
  }
}
