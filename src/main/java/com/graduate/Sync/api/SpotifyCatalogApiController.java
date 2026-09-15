package com.graduate.Sync.api;

import com.graduate.Sync.service.SpotifyAppTokenService;
import com.graduate.Sync.util.MatchUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * iTunes 검색/조회가 아무 결과도 못 찾았을 때만 프론트에서 호출하는 Spotify 카탈로그 폴백.
 * Client Credentials(앱 자격)로 동작하므로 사용자 로그인/Spotify 연동 여부와 무관하게 항상 사용 가능.
 * (기존 /api/spotify/* 는 로그인 + 사용자 본인의 Spotify 연동이 있어야만 동작하는 별개 엔드포인트)
 */
@RestController
@RequestMapping("/api/spotify/catalog")
public class SpotifyCatalogApiController {

    @Autowired private RestTemplate restTemplate;
    @Autowired private SpotifyAppTokenService tokenService;

    /* ── 트랙 검색 폴백 ── */
    @GetMapping("/search")
    public ResponseEntity<Map<String, Object>> search(@RequestParam String q,
                                                        @RequestParam(defaultValue = "20") int limit) {
        Map<String, Object> out = new HashMap<>();
        String token = tokenService.getToken();
        if (token == null) { out.put("tracks", List.of()); return ResponseEntity.ok(out); }

        try {
            String url = "https://api.spotify.com/v1/search?q=" + enc(q)
                    + "&type=track&limit=" + Math.min(Math.max(limit, 1), 50) + "&market=KR";
            Map<String, Object> body = get(url, token);
            List<Map<String, Object>> items = itemsFrom(body, "tracks");

            List<Map<String, Object>> tracks = new ArrayList<>();
            for (Map<String, Object> item : items) tracks.add(toTrack(item));
            out.put("tracks", tracks);
        } catch (Exception e) {
            System.err.println("[Spotify Catalog] 검색 실패 [" + q + "]: " + e.getMessage());
            out.put("tracks", List.of());
        }
        return ResponseEntity.ok(out);
    }

    /* ── 아티스트 검색 폴백 ── */
    @GetMapping("/search-artists")
    public ResponseEntity<Map<String, Object>> searchArtists(@RequestParam String q,
                                                               @RequestParam(defaultValue = "6") int limit) {
        Map<String, Object> out = new HashMap<>();
        String token = tokenService.getToken();
        if (token == null) { out.put("artists", List.of()); return ResponseEntity.ok(out); }

        try {
            String url = "https://api.spotify.com/v1/search?q=" + enc(q)
                    + "&type=artist&limit=" + Math.min(Math.max(limit, 1), 20);
            Map<String, Object> body = get(url, token);
            List<Map<String, Object>> items = itemsFrom(body, "artists");

            List<Map<String, Object>> artists = new ArrayList<>();
            for (Map<String, Object> a : items) {
                Map<String, Object> entry = new HashMap<>();
                entry.put("name", a.get("name"));
                entry.put("id",   a.get("id"));
                entry.put("image", firstImage(a));
                artists.add(entry);
            }
            out.put("artists", artists);
        } catch (Exception e) {
            System.err.println("[Spotify Catalog] 아티스트 검색 실패 [" + q + "]: " + e.getMessage());
            out.put("artists", List.of());
        }
        return ResponseEntity.ok(out);
    }

    /* ── 아티스트 상세(앨범+트랙) 폴백 ── */
    @GetMapping("/artist-detail")
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> artistDetail(@RequestParam String name) {
        Map<String, Object> out = new HashMap<>();
        out.put("image", null);
        out.put("externalId", null);
        out.put("albums", List.of());
        out.put("flatTracks", List.of());

        String token = tokenService.getToken();
        if (token == null) return ResponseEntity.ok(out);

        try {
            // 1) 아티스트 이름 → ID (후보 5건 중 이름이 실제로 일치하는 것만 채택 — 오매칭 방지)
            String searchUrl = "https://api.spotify.com/v1/search?q=" + enc(name) + "&type=artist&limit=5";
            List<Map<String, Object>> artistItems = itemsFrom(get(searchUrl, token), "artists");

            Map<String, Object> artist = null;
            for (Map<String, Object> candidate : artistItems) {
                if (MatchUtils.artistMatches(name, (String) candidate.get("name"))) {
                    artist = candidate;
                    break;
                }
            }
            if (artist == null) return ResponseEntity.ok(out);

            String artistId    = (String) artist.get("id");
            String artistImage = firstImage(artist);
            String artistName  = (String) artist.get("name");

            out.put("image", artistImage);
            out.put("externalId", artistId);

            // 2) 아티스트 앨범 목록 (동일 앨범의 여러 마켓판 중복 제거, 최대 10개)
            String albumsUrl = "https://api.spotify.com/v1/artists/" + artistId
                    + "/albums?include_groups=album,single&market=KR&limit=20";
            Map<String, Object> albumsBody = get(albumsUrl, token);
            List<Map<String, Object>> albumItems = listOf(albumsBody.get("items"));

            LinkedHashMap<String, String> idByName = new LinkedHashMap<>();
            for (Map<String, Object> a : albumItems) {
                String an = (String) a.get("name");
                if (an == null || idByName.containsKey(an)) continue;
                idByName.put(an, (String) a.get("id"));
                if (idByName.size() >= 10) break;
            }
            List<String> albumIds = new ArrayList<>(idByName.values());
            if (albumIds.isEmpty()) return ResponseEntity.ok(out);

            // 3) 여러 앨범을 한 번에 조회(트랙 포함) — Get Several Albums
            String severalUrl = "https://api.spotify.com/v1/albums?ids=" + String.join(",", albumIds) + "&market=KR";
            List<Map<String, Object>> fullAlbums = listOf(get(severalUrl, token).get("albums"));

            String[] grads  = {"grad-1","grad-2","grad-3","grad-4","grad-5","grad-6","grad-7","grad-8"};
            String[] emojis = {"🎵","🎸","🎤","💜","🔥","🌙","⭐","🎧","🚗","💎"};
            int gi = 0;

            List<Map<String, Object>> albums = new ArrayList<>();
            List<Map<String, Object>> flatTracks = new ArrayList<>();

            for (Map<String, Object> alb : fullAlbums) {
                if (alb == null) continue;
                String albumArt = firstImage(alb);
                int year = yearFrom((String) alb.get("release_date"));

                List<Map<String, Object>> albumTracks = new ArrayList<>();
                Map<String, Object> tracksObj = (Map<String, Object>) alb.get("tracks");
                List<Map<String, Object>> trackItems = tracksObj != null ? listOf(tracksObj.get("items")) : List.of();

                for (Map<String, Object> t : trackItems) {
                    Map<String, Object> track = baseTrack(t, artistName, (String) alb.get("name"), albumArt, year, gi);
                    gi++;
                    albumTracks.add(track);
                    flatTracks.add(track);
                }

                Map<String, Object> albumEntry = new HashMap<>();
                albumEntry.put("id", alb.get("id"));
                albumEntry.put("name", alb.get("name"));
                albumEntry.put("art", albumArt);
                albumEntry.put("year", year);
                albumEntry.put("artistName", artistName);
                albumEntry.put("tracks", albumTracks);
                albums.add(albumEntry);
            }

            albums.sort((a, b) -> ((Integer) b.get("year")) - ((Integer) a.get("year")));
            out.put("albums", albums);
            out.put("flatTracks", flatTracks);

        } catch (Exception e) {
            System.err.println("[Spotify Catalog] 아티스트 상세 실패 [" + name + "]: " + e.getMessage());
        }
        return ResponseEntity.ok(out);
    }

    /* ── 앨범 상세 폴백 (아티스트명+앨범명으로 재검색) ── */
    @GetMapping("/album-detail")
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> albumDetail(@RequestParam String artistName,
                                                             @RequestParam String albumName) {
        Map<String, Object> out = new HashMap<>();
        out.put("albumName", albumName);
        out.put("artistName", artistName);
        out.put("albumArt", null);
        out.put("releaseYear", null);
        out.put("tracks", List.of());

        String token = tokenService.getToken();
        if (token == null) return ResponseEntity.ok(out);

        try {
            String searchUrl = "https://api.spotify.com/v1/search?q=" + enc(albumName + " " + artistName)
                    + "&type=album&limit=5&market=KR";
            List<Map<String, Object>> albumItems = itemsFrom(get(searchUrl, token), "albums");

            String albumId = null;
            for (Map<String, Object> candidate : albumItems) {
                List<Map<String, Object>> cArtists = listOf(candidate.get("artists"));
                String cArtistName = !cArtists.isEmpty() ? (String) cArtists.get(0).get("name") : null;
                if (MatchUtils.artistMatches(artistName, cArtistName)) {
                    albumId = (String) candidate.get("id");
                    break;
                }
            }
            if (albumId == null) return ResponseEntity.ok(out);

            Map<String, Object> alb = get("https://api.spotify.com/v1/albums/" + albumId + "?market=KR", token);

            String albumArt = firstImage(alb);
            String realAlbumName = (String) alb.get("name");
            Integer year = yearFrom((String) alb.get("release_date"));
            if (year == 0) year = null;

            List<Map<String, Object>> artistsList = listOf(alb.get("artists"));
            String realArtistName = !artistsList.isEmpty() ? (String) artistsList.get(0).get("name") : artistName;

            Map<String, Object> tracksObj = (Map<String, Object>) alb.get("tracks");
            List<Map<String, Object>> trackItems = tracksObj != null ? listOf(tracksObj.get("items")) : List.of();

            List<Map<String, Object>> tracks = new ArrayList<>();
            int i = 0;
            for (Map<String, Object> t : trackItems) {
                tracks.add(baseTrack(t, realArtistName, realAlbumName, albumArt, year == null ? 0 : year, i++));
            }

            out.put("albumName", realAlbumName);
            out.put("artistName", realArtistName);
            out.put("albumArt", albumArt);
            out.put("releaseYear", year);
            out.put("tracks", tracks);

        } catch (Exception e) {
            System.err.println("[Spotify Catalog] 앨범 상세 실패 [" + albumName + "]: " + e.getMessage());
        }
        return ResponseEntity.ok(out);
    }

    /* ══ 공통 헬퍼 ══════════════════════════════════════ */

    @SuppressWarnings("unchecked")
    private Map<String, Object> get(String url, String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        ResponseEntity<Map> res = restTemplate.exchange(url, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
        Map<String, Object> body = res.getBody();
        return body != null ? body : new HashMap<>();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> itemsFrom(Map<String, Object> body, String key) {
        Object outer = body.get(key);
        if (!(outer instanceof Map)) return List.of();
        return listOf(((Map<String, Object>) outer).get("items"));
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> listOf(Object o) {
        return o instanceof List ? (List<Map<String, Object>>) o : List.of();
    }

    @SuppressWarnings("unchecked")
    private String firstImage(Map<String, Object> obj) {
        List<Map<String, Object>> images = listOf(obj.get("images"));
        return !images.isEmpty() ? (String) images.get(0).get("url") : null;
    }

    private int yearFrom(String releaseDate) {
        if (releaseDate == null || releaseDate.length() < 4) return 0;
        try { return Integer.parseInt(releaseDate.substring(0, 4)); } catch (Exception e) { return 0; }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> toTrack(Map<String, Object> item) {
        List<Map<String, Object>> artists = listOf(item.get("artists"));
        String artistName = !artists.isEmpty() ? (String) artists.get(0).get("name") : "";

        Map<String, Object> album = (Map<String, Object>) item.get("album");
        String albumArt = null, albumName = null;
        if (album != null) {
            albumName = (String) album.get("name");
            albumArt = firstImage(album);
        }
        return baseTrack(item, artistName, albumName, albumArt, 0, 0);
    }

    /** Spotify 트랙 객체 → 프론트가 바로 쓸 수 있는 공통 트랙 shape */
    private Map<String, Object> baseTrack(Map<String, Object> t, String artistName, String albumName,
                                           String albumArt, int year, int idx) {
        Map<String, Object> track = new HashMap<>();
        Object trackId = t.get("id");
        track.put("_id", "sp_" + trackId);
        track.put("name", t.get("name"));
        track.put("artist", artistName);
        track.put("album", albumName);
        track.put("albumArt", albumArt);

        Object durationMs = t.get("duration_ms");
        track.put("durationMs", durationMs);
        track.put("duration", fmtDuration(durationMs));
        track.put("previewUrl", t.get("preview_url"));
        track.put("spotifyId", trackId);

        Object trackNumber = t.get("track_number");
        track.put("trackNumber", trackNumber != null ? trackNumber : (idx + 1));
        track.put("releaseYear", year);
        return track;
    }

    private String fmtDuration(Object durationMsObj) {
        if (!(durationMsObj instanceof Number)) return "—";
        long ms = ((Number) durationMsObj).longValue();
        long totalSec = ms / 1000;
        long m = totalSec / 60, s = totalSec % 60;
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    private String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
