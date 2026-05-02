package com.sync.backend.dto.response;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class LoginResponse {

    private String token;
    private Long id;
    private String username;
    private String email;

    public static LoginResponse of(String token, Long id, String username, String email) {
        return LoginResponse.builder()
                .token(token)
                .id(id)
                .username(username)
                .email(email)
                .build();
    }
}