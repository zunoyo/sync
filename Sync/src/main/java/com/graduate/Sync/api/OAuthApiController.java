package com.graduate.Sync.api;

import com.graduate.Sync.service.OAuthLoginService;
import com.graduate.Sync.service.OAuthLoginService.OAuthResult;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.UUID;

/**
 * Google / Naver 소셜 로그인 진입점 + 콜백
 *
 * 흐름 (Spotify 연동 /api/spotify/connect·callback 과 동일한 서버 리다이렉트 방식):
 *   GET /api/oauth/google  → 302 → accounts.google.com 로그인 화면
 *   GET /api/oauth/google/callback?code=... → 세션 생성 → "/" 로 리다이렉트
 *   GET /api/oauth/naver   → 302 → nid.naver.com 로그인 화면 (state 세션 저장)
 *   GET /api/oauth/naver/callback?code=...&state=... → state 검증 → 세션 생성 → "/"
 *
 * 주의: @RestController에서 "redirect:" 문자열을 그대로 반환하면 JSON으로 응답되어
 *       실제 리다이렉트가 되지 않는다. 반드시 ResponseEntity + Location 헤더로 302를 만든다.
 */
@RestController
@RequestMapping("/api/oauth")
public class OAuthApiController {

    @Autowired
    private OAuthLoginService oauthLoginService;

    /* ── Google 로그인 시작 ── */
    @GetMapping("/google")
    public ResponseEntity<Void> googleLogin() {
        return redirect(oauthLoginService.buildGoogleAuthUrl());
    }

    /* ── Google 콜백 ── */
    @GetMapping("/google/callback")
    public ResponseEntity<Void> googleCallback(
            @RequestParam(value = "code",  required = false) String code,
            @RequestParam(value = "error", required = false) String error,
            HttpSession session) {

        if (error != null || code == null) {
            return redirect("/?oauth=cancelled");
        }

        OAuthResult result = oauthLoginService.handleGoogleCallback(code);
        if (result == null) {
            return redirect("/login?error=google");
        }

        session.setAttribute("loginUser", result.user());
        // 신규 가입자는 이메일 회원가입과 동일하게 Spotify 연동 페이지로 안내
        return result.isNewUser() ? redirect("/api/spotify/connect") : redirect("/");
    }

    /* ── Naver 로그인 시작 (state를 세션에 저장 후 리다이렉트) ── */
    @GetMapping("/naver")
    public ResponseEntity<Void> naverLogin(HttpSession session) {
        String state = UUID.randomUUID().toString();
        session.setAttribute("naver_oauth_state", state);
        return redirect(oauthLoginService.buildNaverAuthUrl(state));
    }

    /* ── Naver 콜백 (state 검증 후 처리) ── */
    @GetMapping("/naver/callback")
    public ResponseEntity<Void> naverCallback(
            @RequestParam(value = "code",  required = false) String code,
            @RequestParam(value = "error", required = false) String error,
            @RequestParam(value = "state", required = false) String state,
            HttpSession session) {

        String savedState = (String) session.getAttribute("naver_oauth_state");
        session.removeAttribute("naver_oauth_state");

        if (error != null || code == null) {
            return redirect("/?oauth=cancelled");
        }
        // CSRF 방지: 요청 시 저장해둔 state와 콜백으로 돌아온 state 대조
        if (savedState == null || !savedState.equals(state)) {
            return redirect("/login?error=naver_state");
        }

        OAuthResult result = oauthLoginService.handleNaverCallback(code, state);
        if (result == null) {
            return redirect("/login?error=naver");
        }

        session.setAttribute("loginUser", result.user());
        return result.isNewUser() ? redirect("/api/spotify/connect") : redirect("/");
    }

    private ResponseEntity<Void> redirect(String location) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(location))
                .build();
    }
}
