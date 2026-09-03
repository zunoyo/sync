package com.graduate.Sync.api;

import com.graduate.Sync.entity.SpotifyAuthEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.SpotifyAuthService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.*;


@RestController
@RequestMapping("/api/spotify")
public class SpotifyApiController {

    @Autowired
    private SpotifyAuthService spotifyAuthService;

    @Autowired
    private org.springframework.web.client.RestTemplate restTemplate;

    @Value("${spotify.client.id}")
    private String clientId;

    @Value("${spotify.redirect.uri}")
    private String redirectUri;

    /* ── Spotify 인증 URL 반환 (JSON) ──────────────────── */
    @GetMapping("/auth")
    public ResponseEntity<Map<String, String>> getAuthUrl() {
        Map<String, String> response = new HashMap<>();
        response.put("authUrl", _buildAuthUrl());
        return ResponseEntity.ok(response);
    }

    /* ── 서버 사이드 리다이렉트 ──────────────────────────────
       @RestController 에서 "redirect:" 문자열은 JSON 으로 반환됨
       → ResponseEntity + Location 헤더로 실제 HTTP 302 리다이렉트
    ─────────────────────────────────────────────────── */
    @GetMapping("/connect")
    public ResponseEntity<Void> connectRedirect(HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) {
            return ResponseEntity.status(HttpStatus.FOUND)
                    .location(URI.create("/login"))
                    .build();
        }
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(_buildAuthUrl()))
                .build();
    }

    /* ── OAuth 콜백 처리 ────────────────────────────────── */
    @GetMapping("/callback")
    public ResponseEntity<Void> callback(
            @RequestParam(value = "code",  required = false) String code,
            @RequestParam(value = "error", required = false) String error,
            HttpSession session) {

        String redirectTo;

        if (error != null || code == null) {
            redirectTo = "/?spotify=cancelled";
        } else {
            UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
            if (loginUser == null) {
                redirectTo = "/login";
            } else {
                SpotifyAuthEntity auth = spotifyAuthService.connect(code, loginUser);
                redirectTo = (auth == null) ? "/?spotify=error" : "/?spotify=connected";
            }
        }

        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(redirectTo))
                .build();
    }

    /* ── Spotify 연동 상태 확인 ─────────────────────────── */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status(HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        boolean connected = spotifyAuthService.isConnected(loginUser);
        Map<String, Object> response = new HashMap<>();
        response.put("connected", connected);

        if (connected) {
            SpotifyAuthEntity auth = spotifyAuthService.getAuth(loginUser);
            response.put("spotifyUserId", auth.getSpotifyUserId());
            response.put("isExpired",     auth.isExpired());
        }
        return ResponseEntity.ok(response);
    }

    /* ── Web Playback SDK 토큰 반환 ─────────────────────── */
    @GetMapping("/player-token")
    public ResponseEntity<Map<String, Object>> getPlayerToken(HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        Map<String, Object> response = new HashMap<>();

        if (loginUser == null) {
            response.put("connected", false);
            response.put("reason",    "로그인이 필요합니다.");
            return ResponseEntity.ok(response);
        }
        if (!spotifyAuthService.isConnected(loginUser)) {
            response.put("connected", false);
            response.put("reason",    "Spotify 연동이 필요합니다.");
            return ResponseEntity.ok(response);
        }

        String token = spotifyAuthService.getValidToken(loginUser);
        if (token == null) {
            response.put("connected", false);
            response.put("reason",    "토큰 갱신 실패 — 재연동 필요");
            return ResponseEntity.ok(response);
        }

        response.put("connected", true);
        response.put("token",     token);
        return ResponseEntity.ok(response);
    }

    /* ── 트랙 spotifyId 검색 (사용자 OAuth 토큰 사용) ──────
       Client Credentials 아닌 사용자 토큰 사용 → Rate Limit 별도
       재생 시점에 호출되어 spotifyId 취득 → SDK 전체 재생
    ──────────────────────────────────────────────────── */
    @GetMapping("/search")
    public ResponseEntity<Map<String, Object>> searchTrack(
            @RequestParam String q, HttpSession session) {

        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        Map<String, Object> result = new HashMap<>();

        if (loginUser == null || !spotifyAuthService.isConnected(loginUser))
            return ResponseEntity.ok(result);

        String token = spotifyAuthService.getValidToken(loginUser);
        if (token == null) return ResponseEntity.ok(result);

        try {
            String encoded = java.net.URLEncoder.encode(q, "UTF-8");
            String url = "https://api.spotify.com/v1/search"
                    + "?q=" + encoded + "&type=track&limit=5";

            HttpHeaders h = new HttpHeaders();
            h.set("Authorization", "Bearer " + token);
            ResponseEntity<Map> res = restTemplate.exchange(
                    url, HttpMethod.GET, new HttpEntity<>(h), Map.class);

            Map<String, Object> body = res.getBody();
            if (body != null) {
                Map<String, Object> tracks = (Map<String, Object>) body.get("tracks");
                if (tracks != null) {
                    List<Map<String, Object>> items =
                            (List<Map<String, Object>>) tracks.get("items");
                    if (items != null && !items.isEmpty()) {
                        List<Map<String, Object>> resultTracks = new ArrayList<>();
                        for (Map<String, Object> t : items) {
                            Map<String, Object> entry = new HashMap<>();
                            entry.put("id",   t.get("id"));
                            entry.put("name", t.get("name"));
                            List<Map<String,Object>> ar =
                                (List<Map<String,Object>>) t.get("artists");
                            if (ar != null && !ar.isEmpty())
                                entry.put("artist", ar.get(0).get("name"));
                            resultTracks.add(entry);
                        }
                        result.put("tracks", resultTracks);
                        // 하위 호환: 첫 번째를 id/name으로도 제공
                        result.put("id",   resultTracks.get(0).get("id"));
                        result.put("name", resultTracks.get(0).get("name"));
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("[SpotifyAPI] 트랙 검색 실패 [" + q + "]: " + e.getMessage());
        }
        return ResponseEntity.ok(result);
    }

    /* ── Spotify 연동 해제 ──────────────────────────────── */
    @DeleteMapping("/disconnect")
    public ResponseEntity<Map<String, Object>> disconnect(HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        spotifyAuthService.disconnect(loginUser);
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "Spotify 연동이 해제됐습니다.");
        return ResponseEntity.ok(response);
    }

    /* ── 공통: 인증 URL 생성 ────────────────────────────── */
    private String _buildAuthUrl() {
        String scope = String.join("%20",
                "user-read-private",
                "user-read-email",
                "streaming",
                "user-modify-playback-state",
                "user-read-playback-state",
                "playlist-modify-public",
                "playlist-modify-private"
        );
        return "https://accounts.spotify.com/authorize"
                + "?client_id="     + clientId
                + "&response_type=code"
                + "&redirect_uri="  + redirectUri
                + "&scope="         + scope;
    }
}
