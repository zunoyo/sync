package com.graduate.Sync.api;

import com.graduate.Sync.dto.UserDTO;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.UserService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
public class UserApiController {

    @Autowired
    private UserService userService;

    /* ── 현재 로그인 사용자 조회 ── */
    @GetMapping("/api/users/me")
    public ResponseEntity<UserEntity> me(HttpSession session) {
        UserEntity user = (UserEntity) session.getAttribute("loginUser");
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(user);
    }

    /* ── 로그인 ── */
    @PostMapping("/api/users/login")
    public ResponseEntity<UserEntity> login(@RequestBody UserDTO dto, HttpSession session) {
        UserEntity user = userService.login(dto.getEmail(), dto.getPassword());
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        session.setAttribute("loginUser", user);
        return ResponseEntity.ok(user);
    }

    /* ── 로그아웃 ── */
    @PostMapping("/api/users/logout")
    public ResponseEntity<Void> logout(HttpSession session) {
        session.invalidate();
        return ResponseEntity.ok().build();
    }

    /* ── 회원가입 ── */
    @PostMapping("/api/users/signup")
    public ResponseEntity<UserEntity> signup(@RequestBody UserDTO dto) {
        UserEntity created = userService.signup(dto);
        if (created == null) return ResponseEntity.status(HttpStatus.CONFLICT).build();
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /* ── 기본 정보 수정 (이름·사용자명·이메일·프로필 이미지) ── */
    @PutMapping("/api/users/me/profile")
    public ResponseEntity<Map<String, Object>> updateProfile(
            @RequestBody UserDTO dto, HttpSession session) {

        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        UserEntity updated = userService.updateProfile(loginUser.getId(), dto);
        Map<String, Object> res = new HashMap<>();

        if (updated == null) {
            res.put("error", "이메일 또는 사용자명이 이미 사용 중이에요.");
            return ResponseEntity.status(HttpStatus.CONFLICT).body(res);
        }

        session.setAttribute("loginUser", updated);
        res.put("message", "프로필이 업데이트됐어요.");
        res.put("user", updated);
        return ResponseEntity.ok(res);
    }

    /* ── 비밀번호 변경 ── */
    @PutMapping("/api/users/me/password")
    public ResponseEntity<Map<String, String>> changePassword(
            @RequestBody Map<String, String> body, HttpSession session) {

        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String result = userService.changePassword(
                loginUser.getId(),
                body.get("currentPassword"),
                body.get("newPassword")
        );

        Map<String, String> res = new HashMap<>();
        if ("ok".equals(result)) {
            res.put("message", "비밀번호가 변경됐어요.");
            return ResponseEntity.ok(res);
        }
        res.put("error", result);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(res);
    }

    /* ── 계정 비활성화 ── */
    @PostMapping("/api/users/me/deactivate")
    public ResponseEntity<Void> deactivate(HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        userService.deactivateAccount(loginUser.getId());
        session.invalidate();
        return ResponseEntity.ok().build();
    }

    /* ── 계정 삭제 ── */
    @DeleteMapping("/api/users/me")
    public ResponseEntity<Void> deleteAccount(HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        userService.deleteAccount(loginUser.getId());
        session.invalidate();
        return ResponseEntity.ok().build();
    }

    /* ── 기존 PATCH 엔드포인트 (호환 유지) ── */
    @PatchMapping("/api/users/{id}")
    public ResponseEntity<UserEntity> update(@PathVariable Long id,
                                              @RequestBody UserDTO dto,
                                              HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null || !loginUser.getId().equals(id))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        UserEntity updated = userService.update(id, dto);
        if (updated == null)
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();

        session.setAttribute("loginUser", updated);
        return ResponseEntity.ok(updated);
    }
}
