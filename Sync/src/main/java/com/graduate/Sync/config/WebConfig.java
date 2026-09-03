package com.graduate.Sync.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new LoginInterceptor())
                .addPathPatterns(
                        "/playlists/**",
                        "/friends/**",
                        "/profile/**",
                        "/search/**",
                        "/sync/**",
                        "/api/playlists/**",
                        "/api/friends/**",
                        "/api/sync/**",
                        "/api/library/**"
                )
                .excludePathPatterns(
                        "/",
                        "/login", "/signup",
                        "/css/**", "/js/**", "/components/**",
                        "/images/**", "/favicon.ico",
                        "/api/users/login",
                        "/api/users/logout",
                        "/api/users/signup",
                        "/api/users/me",
                        "/api/sync/test-clip"
                );
    }
}
