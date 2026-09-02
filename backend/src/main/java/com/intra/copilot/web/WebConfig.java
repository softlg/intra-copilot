package com.intra.copilot.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;

@Configuration
public class WebConfig implements WebMvcConfigurer {
  @Value("${app.cors-origins}")
  String origins;

  public void addCorsMappings(CorsRegistry r) {
    r.addMapping("/**")
        .allowedOriginPatterns(origins.split(","))
        .allowedMethods("GET", "POST", "PATCH", "DELETE", "OPTIONS")
        .allowedHeaders("*");
  }
}
