package com.graduate.Sync.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;

/**
 * Spotify Client Credentials 토큰 발급/캐싱.
 * 사용자 로그인/Spotify 연동 없이 앱 자격으로 카탈로그(검색/아티스트/앨범) 조회에 사용.
 * 플레이백이나 사용자 개인 데이터가 필요한 곳은 여전히 SpotifyAuthService의 사용자 OAuth 토큰을 써야 함.
 */
@Service
public class SpotifyAppTokenService {

    @Autowired
    private RestTemplate restTemplate;

    @Value("${spotify.client.id:}")
    private String clientId;

    @Value("${spotify.client.secret:}")
    private String clientSecret;

    // 토큰 캐시 (1시간 유효)
    private String        token;
    private LocalDateTime tokenExpiry;

    public synchronized String getToken() {
        if (clientId == null || clientId.isBlank()
                || clientSecret == null || clientSecret.isBlank()) {
            System.out.println("[Spotify] Client ID/Secret 미설정");
            return null;
        }

        // 캐시된 토큰이 유효하면 재사용
        if (token != null && tokenExpiry != null
                && LocalDateTime.now().isBefore(tokenExpiry)) {
            return token;
        }

        try {
            String credentials = clientId + ":" + clientSecret;
            String encoded = Base64.getEncoder()
                    .encodeToString(credentials.getBytes());

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            headers.set("Authorization", "Basic " + encoded);

            MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
            body.add("grant_type", "client_credentials");

            HttpEntity<MultiValueMap<String, String>> req =
                    new HttpEntity<>(body, headers);

            ResponseEntity<Map> res = restTemplate.postForEntity(
                    "https://accounts.spotify.com/api/token", req, Map.class);

            Map<String, Object> data = res.getBody();
            if (data == null) return null;

            token = (String) data.get("access_token");
            Integer expiresIn = (Integer) data.get("expires_in");
            tokenExpiry = LocalDateTime.now()
                    .plusSeconds(expiresIn != null ? expiresIn - 60 : 3540);

            System.out.println("[Spotify] 앱 토큰 발급 성공");
            return token;

        } catch (Exception e) {
            System.err.println("[Spotify] 앱 토큰 발급 실패: " + e.getMessage());
            return null;
        }
    }
}
