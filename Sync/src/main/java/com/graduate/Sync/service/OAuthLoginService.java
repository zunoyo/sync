package com.graduate.Sync.service;

import com.graduate.Sync.entity.OAuthAccountEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.repository.OAuthAccountRepository;
import com.graduate.Sync.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Google / Naver 소셜 로그인 처리
 * (Spotify 연동과 동일하게 서버 사이드 authorization-code 리다이렉트 방식 사용
 *  — 팝업/토큰 노출이 없는 서버-투-서버 방식이라 implicit flow보다 안전함)
 *
 * 흐름:
 *   1. OAuthApiController가 각 provider 로그인 화면으로 302 리다이렉트
 *   2. 사용자 승인 후 provider가 ?code=... 로 콜백
 *   3. code → access_token 서버에서 직접 교환 (client_secret 사용)
 *   4. access_token으로 프로필 조회 → oauth_accounts 조회
 *      ├─ 있음 → 기존 사용자 반환
 *      └─ 없음 → 이메일 중복이면 계정 연결, 아니면 신규 생성
 */
@Service
public class OAuthLoginService {

    @Autowired private UserRepository         userRepository;
    @Autowired private OAuthAccountRepository oauthRepository;
    @Autowired private RestTemplate           restTemplate;

    @Value("${google.client.id}")     private String googleClientId;
    @Value("${google.client.secret}") private String googleClientSecret;
    @Value("${google.redirect.uri}")  private String googleRedirectUri;

    @Value("${naver.client.id}")      private String naverClientId;
    @Value("${naver.client.secret}")  private String naverClientSecret;
    @Value("${naver.redirect.uri}")   private String naverRedirectUri;

    /* ══════════════════════════════════════════════════════
       인증 URL 생성
    ══════════════════════════════════════════════════════ */

    public String buildGoogleAuthUrl() {
        String scope    = encode("openid email profile");
        String redirect = encode(googleRedirectUri);
        return "https://accounts.google.com/o/oauth2/v2/auth"
                + "?client_id=" + googleClientId
                + "&redirect_uri=" + redirect
                + "&response_type=code"
                + "&scope=" + scope
                + "&access_type=online"
                + "&prompt=select_account";
    }

    // 네이버는 state 파라미터가 필수(CSRF 방지). 컨트롤러가 세션에 저장한 state를 그대로 받는다.
    public String buildNaverAuthUrl(String state) {
        String redirect = encode(naverRedirectUri);
        return "https://nid.naver.com/oauth2.0/authorize"
                + "?response_type=code"
                + "&client_id=" + naverClientId
                + "&redirect_uri=" + redirect
                + "&state=" + encode(state);
    }

    /* ══════════════════════════════════════════════════════
       콜백 처리 — code → 사용자 조회/생성
    ══════════════════════════════════════════════════════ */

    /* ── 신규 가입 여부를 함께 반환하기 위한 작은 결과 래퍼 ──────────
       (기존 이메일 회원가입은 성공 시 /api/spotify/connect 로 안내하는데,
        소셜 로그인도 "신규 가입"일 때만 동일하게 안내하기 위해 필요)
    ─────────────────────────────────────────────────────────── */
    public record OAuthResult(UserEntity user, boolean isNewUser) {}

    @Transactional
    public OAuthResult handleGoogleCallback(String code) {
        Map<String, Object> tokenData = exchangeGoogleCode(code);
        if (tokenData == null || tokenData.get("access_token") == null) return null;

        Map<String, Object> profile = fetchGoogleProfile((String) tokenData.get("access_token"));
        if (profile == null || profile.get("sub") == null) return null;

        String providerUserId = (String) profile.get("sub");
        String email   = (String) profile.get("email");
        String name    = (String) profile.get("name");
        String picture = (String) profile.get("picture");

        return findOrCreateUser("google", providerUserId, email, name, picture);
    }

    @Transactional
    public OAuthResult handleNaverCallback(String code, String state) {
        Map<String, Object> tokenData = exchangeNaverCode(code, state);
        if (tokenData == null || tokenData.get("access_token") == null) return null;

        Map<String, Object> result = fetchNaverProfile((String) tokenData.get("access_token"));
        if (result == null || !"00".equals(String.valueOf(result.get("resultcode")))) return null;

        @SuppressWarnings("unchecked")
        Map<String, Object> profile = (Map<String, Object>) result.get("response");
        if (profile == null || profile.get("id") == null) return null;

        String providerUserId = (String) profile.get("id");
        String email   = (String) profile.get("email");
        String name    = (String) profile.get("name");
        if (name == null || name.isBlank()) name = (String) profile.get("nickname");
        String picture = (String) profile.get("profile_image");

        return findOrCreateUser("naver", providerUserId, email, name, picture);
    }

    /* ══════════════════════════════════════════════════════
       공통: 사용자 조회 또는 생성
    ══════════════════════════════════════════════════════ */

    private OAuthResult findOrCreateUser(String provider, String providerUserId,
                                         String email, String name, String avatarUrl) {

        // 1. 이미 연결된 소셜 계정이면 바로 반환 (기존 사용자)
        Optional<OAuthAccountEntity> existing =
                oauthRepository.findByProviderAndProviderUserId(provider, providerUserId);
        if (existing.isPresent()) {
            return new OAuthResult(existing.get().getUser(), false);
        }

        // 2. 이메일이 이미 가입된 계정이면 소셜 계정만 연결 (계정 통합, 기존 사용자 취급)
        if (email != null && !email.isBlank()) {
            Optional<UserEntity> emailUser = userRepository.findByEmail(email);
            if (emailUser.isPresent()) {
                UserEntity user = emailUser.get();
                oauthRepository.save(new OAuthAccountEntity(null, user, provider, providerUserId, null));
                return new OAuthResult(user, false);
            }
        }

        // 3. 완전 신규 사용자 생성
        String safeEmail = (email != null && !email.isBlank())
                ? email
                : provider + "_" + providerUserId + "@soundwave.local";

        String username = buildUsername(name, provider);
        while (userRepository.existsByUsername(username)) {
            username = username + "_" + UUID.randomUUID().toString().substring(0, 4);
        }

        UserEntity user = new UserEntity(
                null,
                username,
                safeEmail,
                "",                                              // passwordHash — 소셜 로그인은 비밀번호 없음
                (name != null && !name.isBlank()) ? name : username, // displayName
                avatarUrl,                                        // profileImageUrl
                true,                                              // isActive
                null, null, null                                  // createdAt/updatedAt/lastActiveAt → @PrePersist가 채움
        );
        user = userRepository.save(user);

        oauthRepository.save(new OAuthAccountEntity(null, user, provider, providerUserId, null));
        return new OAuthResult(user, true);
    }

    private String buildUsername(String name, String provider) {
        if (name != null && !name.isBlank()) {
            String cleaned = name.replaceAll("[^a-zA-Z0-9가-힣_]", "");
            if (!cleaned.isBlank()) {
                return cleaned.substring(0, Math.min(cleaned.length(), 20));
            }
        }
        return provider + "_" + UUID.randomUUID().toString().substring(0, 8);
    }

    /* ══════════════════════════════════════════════════════
       Google API 호출
    ══════════════════════════════════════════════════════ */

    private Map<String, Object> exchangeGoogleCode(String code) {
        try {
            MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
            body.add("client_id",     googleClientId);
            body.add("client_secret", googleClientSecret);
            body.add("code",          code);
            body.add("grant_type",    "authorization_code");
            body.add("redirect_uri",  googleRedirectUri);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(body, headers);

            ResponseEntity<Map> response = restTemplate.postForEntity(
                    "https://oauth2.googleapis.com/token", request, Map.class);
            return response.getBody();
        } catch (Exception e) {
            System.err.println("[OAuth] Google 토큰 교환 실패: " + e.getMessage());
            return null;
        }
    }

    private Map<String, Object> fetchGoogleProfile(String accessToken) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + accessToken);
            HttpEntity<Void> request = new HttpEntity<>(headers);

            ResponseEntity<Map> response = restTemplate.exchange(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    HttpMethod.GET, request, Map.class);
            return response.getBody();
        } catch (Exception e) {
            System.err.println("[OAuth] Google 프로필 조회 실패: " + e.getMessage());
            return null;
        }
    }

    /* ══════════════════════════════════════════════════════
       Naver API 호출
    ══════════════════════════════════════════════════════ */

    private Map<String, Object> exchangeNaverCode(String code, String state) {
        try {
            // 네이버 공식 문서 기준 — 토큰 발급은 GET + 쿼리스트링 방식
            String url = "https://nid.naver.com/oauth2.0/token"
                    + "?grant_type=authorization_code"
                    + "&client_id=" + naverClientId
                    + "&client_secret=" + naverClientSecret
                    + "&code=" + encode(code)
                    + "&state=" + encode(state);

            ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);
            return response.getBody();
        } catch (Exception e) {
            System.err.println("[OAuth] Naver 토큰 교환 실패: " + e.getMessage());
            return null;
        }
    }

    private Map<String, Object> fetchNaverProfile(String accessToken) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + accessToken);
            HttpEntity<Void> request = new HttpEntity<>(headers);

            ResponseEntity<Map> response = restTemplate.exchange(
                    "https://openapi.naver.com/v1/nid/me",
                    HttpMethod.GET, request, Map.class);
            return response.getBody();
        } catch (Exception e) {
            System.err.println("[OAuth] Naver 프로필 조회 실패: " + e.getMessage());
            return null;
        }
    }

    /* ── 유틸 ── */
    private String encode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
