package com.sync.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class SpotifyService {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${spotify.client-id}")
    private String clientId;

    @Value("${spotify.client-secret}")
    private String clientSecret;

    private static final String TOKEN_URL = "https://accounts.spotify.com/api/token";
    private static final String SEARCH_URL = "https://api.spotify.com/v1/search";

    private volatile String cachedToken;
    private volatile long tokenExpiryMs = 0;

    private synchronized String getAccessToken() {
        if (cachedToken != null && System.currentTimeMillis() < tokenExpiryMs) {
            return cachedToken;
        }

        String credentials = Base64.getEncoder()
                .encodeToString((clientId + ":" + clientSecret).getBytes(StandardCharsets.UTF_8));

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Basic " + credentials);
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("grant_type", "client_credentials");

        ResponseEntity<String> response = restTemplate.postForEntity(
                TOKEN_URL, new HttpEntity<>(body, headers), String.class);

        try {
            JsonNode tokenJson = objectMapper.readTree(response.getBody());
            if (!tokenJson.has("access_token")) {
                throw new IllegalStateException("Spotify 액세스 토큰 발급 실패");
            }
            cachedToken = tokenJson.get("access_token").asText();
            int expiresIn = tokenJson.path("expires_in").asInt(3600);
            tokenExpiryMs = System.currentTimeMillis() + (expiresIn - 60) * 1000L;
            return cachedToken;
        } catch (Exception e) {
            throw new IllegalStateException("Spotify 토큰 파싱 실패: " + e.getMessage(), e);
        }
    }

    public Optional<SpotifyTrackInfo> searchTrack(String trackName, String artistName) {
        try {
            String token = getAccessToken();

            String query = "track:" + trackName + " artist:" + artistName;
            String url = SEARCH_URL + "?q=" + URLEncoder.encode(query, StandardCharsets.UTF_8)
                    + "&type=track&limit=1";

            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + token);

            ResponseEntity<String> response = restTemplate.exchange(
                    url, HttpMethod.GET, new HttpEntity<>(headers), String.class);

            if (response.getBody() == null) return Optional.empty();

            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode items = root.path("tracks").path("items");
            if (!items.isArray() || items.isEmpty()) return Optional.empty();

            JsonNode item = items.get(0);
            String trackId = item.path("id").asText(null);
            String previewUrl = item.path("preview_url").isNull() ? null : item.path("preview_url").asText(null);

            JsonNode artists = item.path("artists");
            String spotifyArtist = (artists.isArray() && !artists.isEmpty())
                    ? artists.get(0).path("name").asText(null) : null;

            String albumName = item.path("album").path("name").asText(null);

            return Optional.of(new SpotifyTrackInfo(trackId, spotifyArtist, albumName, previewUrl));

        } catch (Exception e) {
            log.warn("Spotify 검색 실패 (track={}, artist={}): {}", trackName, artistName, e.getMessage());
            return Optional.empty();
        }
    }

    public record SpotifyTrackInfo(String trackId, String artistName, String albumName, String previewUrl) {}
}
