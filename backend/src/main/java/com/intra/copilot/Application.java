package com.intra.copilot;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.mybatis.spring.annotation.MapperScan;

@SpringBootApplication
@MapperScan("com.intra.copilot.repo")
public class Application {
  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
