package com.sync.backend.controller;

import com.sync.backend.dto.request.LoginRequest;
import com.sync.backend.dto.request.SignUpRequest;
import com.sync.backend.dto.response.LoginResponse;
import com.sync.backend.dto.response.UserResponse;
import com.sync.backend.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    // 회원가입
    @PostMapping("/signup")
    public ResponseEntity<UserResponse> signUp(@Valid @RequestBody SignUpRequest request) {
        return ResponseEntity.ok(userService.signUp(request));
    }

    // 로그인 → JWT 토큰 반환
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(userService.login(request));
    }

    // 토큰 인증 테스트용
    @GetMapping("/me")
    public ResponseEntity<String> me(@AuthenticationPrincipal Long userId) {
        return ResponseEntity.ok("로그인한 사용자 ID: " + userId);
    }

}

