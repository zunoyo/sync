package com.sync.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class RestTemplateConfig {
 //Spring Boot가 FastAPI에 HTTP 요청을 보낼 수 있게 설정
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
