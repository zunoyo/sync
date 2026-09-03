package com.graduate.Sync.service;

import com.graduate.Sync.dto.SpotifyAuthDTO;
import com.graduate.Sync.entity.SpotifyAuthEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.repository.SpotifyAuthRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;

@Service
public class SpotifyAuthService {

    @Autowired
    private SpotifyAuthRepository spotifyAuthRepository;

    @Autowired
    private RestTemplate restTemplate;

    // application.properties에서 설정
    @Value("${spotify.client.id}")
    private String clientId;

    @Value("${spotify.client.secret}")
    private String clientSecret;

    @Value("${spotify.redirect.uri}")
    private String redirectUri;

    /* ── Spotify 연동 여부 확인 ────────────────────────── */
    public boolean isConnected(UserEntity user) {
        return spotifyAuthRepository.existsByUser(user);
    }

    /* ── Spotify 인증 정보 조회 ────────────────────────── */
    public SpotifyAuthEntity getAuth(UserEntity user) {
        return spotifyAuthRepository.findByUser(user).orElse(null);
    }

    /* ── OAuth 콜백 처리 + 토큰 저장 ──────────────────── */
    public SpotifyAuthEntity connect(String code, UserEntity user) {
        // 1. code → access_token, refresh_token 교환
        Map<String, Object> tokenData = exchangeCodeForToken(code);
        if (tokenData == null) return null;

        // 2. Spotify 사용자 ID 조회
        String accessToken  = (String) tokenData.get("access_token");
        String refreshToken = (String) tokenData.get("refresh_token");
        Integer expiresIn   = (Integer) tokenData.get("expires_in");
        String scope        = (String) tokenData.get("scope");

        String spotifyUserId = getSpotifyUserId(accessToken);
        if (spotifyUserId == null) return null;

        // 3. 만료 시각 계산 (현재 시각 + expires_in 초)
        LocalDateTime expiresAt = LocalDateTime.now()
                .plusSeconds(expiresIn != null ? expiresIn : 3600);

        // 4. 기존 연동 정보 있으면 업데이트, 없으면 신규 저장
        SpotifyAuthEntity existing =
                spotifyAuthRepository.findByUser(user).orElse(null);

        if (existing != null) {
            existing.updateTokens(accessToken, refreshToken, expiresAt);
            return spotifyAuthRepository.save(existing);
        }

        // 신규 저장
        SpotifyAuthDTO dto = new SpotifyAuthDTO();
        dto.setSpotifyUserId(spotifyUserId);
        dto.setAccessToken(accessToken);
        dto.setRefreshToken(refreshToken);
        dto.setExpiresAt(expiresAt);
        dto.setScope(scope);

        return spotifyAuthRepository.save(dto.toEntity(user));
    }

    /* ── 유효한 액세스 토큰 반환 (만료 시 자동 갱신) ───── */
    public String getValidToken(UserEntity user) {
        SpotifyAuthEntity auth =
                spotifyAuthRepository.findByUser(user).orElse(null);

        if (auth == null) return null;

        // 만료됐으면 자동 갱신
        if (auth.isExpired()) {
            auth = refreshAccessToken(auth);
        }

        return auth != null ? auth.getAccessToken() : null;
    }

    /* ── 액세스 토큰 갱신 ──────────────────────────────── */
    public SpotifyAuthEntity refreshAccessToken(SpotifyAuthEntity auth) {
        try {
            // 요청 헤더: Base64(client_id:client_secret)
            String credentials = clientId + ":" + clientSecret;
            String encodedCredentials = Base64.getEncoder()
                    .encodeToString(credentials.getBytes());

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            headers.set("Authorization", "Basic " + encodedCredentials);

            // 요청 바디
            MultiValueMap<String, String> body =
                    new LinkedMultiValueMap<>();
            body.add("grant_type",    "refresh_token");
            body.add("refresh_token", auth.getRefreshToken());

            HttpEntity<MultiValueMap<String, String>> request =
                    new HttpEntity<>(body, headers);

            // Spotify Token API 호출
            ResponseEntity<Map> response = restTemplate.postForEntity(
                    "https://accounts.spotify.com/api/token",
                    request,
                    Map.class
            );

            Map<String, Object> tokenData = response.getBody();
            if (tokenData == null) return null;

            String newAccessToken  = (String) tokenData.get("access_token");
            // refresh_token이 새로 발급된 경우 갱신, 없으면 기존 유지
            String newRefreshToken = tokenData.containsKey("refresh_token")
                    ? (String) tokenData.get("refresh_token")
                    : auth.getRefreshToken();

            Integer expiresIn = (Integer) tokenData.get("expires_in");
            LocalDateTime newExpiresAt = LocalDateTime.now()
                    .plusSeconds(expiresIn != null ? expiresIn : 3600);

            // DB 업데이트
            auth.updateTokens(newAccessToken, newRefreshToken, newExpiresAt);
            return spotifyAuthRepository.save(auth);

        } catch (Exception e) {
            System.err.println("토큰 갱신 실패: " + e.getMessage());
            return null;
        }
    }

    /* ── code → token 교환 ─────────────────────────────── */
    private Map<String, Object> exchangeCodeForToken(String code) {
        try {
            String credentials = clientId + ":" + clientSecret;
            String encodedCredentials = Base64.getEncoder()
                    .encodeToString(credentials.getBytes());

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            headers.set("Authorization", "Basic " + encodedCredentials);

            MultiValueMap<String, String> body =
                    new LinkedMultiValueMap<>();
            body.add("grant_type",   "authorization_code");
            body.add("code",          code);
            body.add("redirect_uri",  redirectUri);

            HttpEntity<MultiValueMap<String, String>> request =
                    new HttpEntity<>(body, headers);

            ResponseEntity<Map> response = restTemplate.postForEntity(
                    "https://accounts.spotify.com/api/token",
                    request,
                    Map.class
            );

            return response.getBody();

        } catch (Exception e) {
            System.err.println("토큰 교환 실패: " + e.getMessage());
            return null;
        }
    }

    /* ── Spotify 사용자 ID 조회 ─────────────────────────── */
    private String getSpotifyUserId(String accessToken) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + accessToken);

            HttpEntity<Void> request = new HttpEntity<>(headers);

            ResponseEntity<Map> response = restTemplate.exchange(
                    "https://api.spotify.com/v1/me",
                    HttpMethod.GET,
                    request,
                    Map.class
            );

            Map<String, Object> userData = response.getBody();
            return userData != null ? (String) userData.get("id") : null;

        } catch (Exception e) {
            System.err.println("Spotify 사용자 ID 조회 실패: " + e.getMessage());
            return null;
        }
    }

    /* ── Spotify 연동 해제 ──────────────────────────────── */
    public void disconnect(UserEntity user) {
        SpotifyAuthEntity auth =
                spotifyAuthRepository.findByUser(user).orElse(null);
        if (auth != null) {
            spotifyAuthRepository.delete(auth);
        }
    }
}