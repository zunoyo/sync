package com.sync.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class LastFmService {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${lastfm.api-key}")
    private String apiKey;

    private static final String BASE_URL = "http://ws.audioscrobbler.com/2.0/";

    public List<LastFmTrack> getTopTracksByTag(String tag, int limit) {
        String encodedTag = URLEncoder.encode(tag, StandardCharsets.UTF_8);
        String url = BASE_URL + "?method=tag.getTopTracks&tag=" + encodedTag
                + "&api_key=" + apiKey + "&format=json&limit=" + limit;

        try {
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            if (response.getBody() == null) return List.of();

            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode tracks = root.path("tracks").path("track");
            List<LastFmTrack> result = new ArrayList<>();

            if (tracks.isArray()) {
                for (JsonNode track : tracks) {
                    String name = track.path("name").asText("");
                    String artist = track.path("artist").path("name").asText("");
                    if (!name.isBlank() && !artist.isBlank()) {
                        result.add(new LastFmTrack(name, artist));
                    }
                }
            }
            return result;

        } catch (Exception e) {
            log.warn("Last.fm API 호출 실패 (tag={}): {}", tag, e.getMessage());
            return List.of();
        }
    }

    public record LastFmTrack(String name, String artist) {}
}
