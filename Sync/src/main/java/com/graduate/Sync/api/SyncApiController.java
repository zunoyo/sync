package com.graduate.Sync.api;

import com.graduate.Sync.dto.EmotionVectorDTO;
import com.graduate.Sync.dto.PlaylistDTO;
import com.graduate.Sync.dto.PlaylistTrackDTO;
import com.graduate.Sync.entity.EmotionVectorEntity;
import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.EmotionVectorService;
import com.graduate.Sync.service.PlaylistService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.Random;
import java.util.*;

@RestController
@RequestMapping("/api/sync")
public class SyncApiController {

    @Autowired private EmotionVectorService emotionVectorService;
    @Autowired private PlaylistService      playlistService;
    @Autowired private RestTemplate         restTemplate;

    @Value("${lastfm.api.key:}")
    private String lastfmApiKey;

    @Value("${spotify.client.id:}")
    private String spotifyClientId;

    @Value("${spotify.client.secret:}")
    private String spotifyClientSecret;

    // Spotify 토큰 캐시 (1시간 유효)
    private String        _spotifyToken;
    private LocalDateTime _spotifyTokenExpiry;

    /* ══ 전체 추천 파이프라인 ══════════════════════════
       ① CLIP 감정 분석
       ② Last.fm 태그 기반 트랙 검색
       ③ Spotify 검색 → 앨범 아트 + 미리듣기 URL
       ④ DB 저장 + 결과 반환
    ═══════════════════════════════════════════════ */
    @Transactional
    @PostMapping("/full-recommend")
    public ResponseEntity<Map<String, Object>> fullRecommend(
            @RequestBody EmotionVectorDTO dto,
            HttpSession session) {

        UserEntity loginUser =
                (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        try {
            /* 1. CLIP 감정 분석 */
            EmotionVectorEntity ev =
                    emotionVectorService.analyze(dto, loginUser);
            if (ev == null)
                return ResponseEntity.status(500)
                        .body(Map.of("error",
                                "CLIP 서버 연결 실패. FastAPI 서버가 실행 중인지 확인하세요."));

            /* 2. Last.fm 태그 → 트랙 검색 */
            List<String> tags = parseTags(ev.getLastfmTags());
            List<Map<String, String>> lastfmTracks = searchLastFm(tags);

            /* 3. Spotify 검색 → 앨범아트 + 미리듣기 */
            String spotifyToken = getSpotifyToken();
            System.out.println("[Sync] Spotify 토큰 " + (spotifyToken != null ? "발급됨" : "발급 실패(null)")
                    + " · Last.fm 트랙 " + lastfmTracks.size() + "건");
            List<Map<String, Object>> trackList = new ArrayList<>();

            if (!lastfmTracks.isEmpty()) {
                PlaylistDTO plDto = new PlaylistDTO();
                plDto.setPlaylistName(ev.getPrimaryEmotion() + " AI 추천");
                plDto.setPublic(false);
                PlaylistEntity playlist = playlistService.create(plDto, loginUser);

                for (int i = 0; i < lastfmTracks.size(); i++) {
                    Map<String, String> t = lastfmTracks.get(i);
                    String name   = t.get("name");
                    String artist = t.get("artist");

                    // Spotify 검색
                    Map<String, Object> spotifyData =
                            searchSpotify(name, artist, spotifyToken);

                    // Spotify가 실패했거나(현재 403 — 앱 소유자 Premium 필요) 일부 정보가
                    // 빠져있으면 iTunes로 보완 (무료 공개 API, 이미 검색/홈 화면에서 사용 중)
                    if (spotifyData.get("previewUrl") == null
                            || spotifyData.get("durationMs") == null
                            || spotifyData.get("albumArt") == null) {
                        Map<String, Object> itunesData = searchItunes(name, artist);
                        spotifyData.putIfAbsent("albumArt",   itunesData.get("albumArt"));
                        spotifyData.putIfAbsent("previewUrl", itunesData.get("previewUrl"));
                        spotifyData.putIfAbsent("durationMs", itunesData.get("durationMs"));
                        spotifyData.putIfAbsent("albumName",  itunesData.get("albumName"));
                    }

                    String spotifyId    = (String) spotifyData.get("id");
                    String albumArtUrl  = (String) spotifyData.get("albumArt");
                    String previewUrl   = (String) spotifyData.get("previewUrl");
                    String albumName    = (String) spotifyData.get("albumName");
                    Object durationMsObj = spotifyData.get("durationMs");
                    Integer durationMs  = durationMsObj instanceof Integer
                            ? (Integer) durationMsObj : null;

                    // DB 저장
                    PlaylistTrackDTO trackDto = new PlaylistTrackDTO();
                    trackDto.setLastfmTrackName(name);
                    trackDto.setLastfmArtistName(artist);
                    trackDto.setSpotifyTrackId(spotifyId != null
                            ? spotifyId
                            : "lastfm_" + i + "_" + name.toLowerCase()
                            .replaceAll("[^a-z0-9]", "_")
                            .substring(0, Math.min(name.length(), 40)));
                    trackDto.setSpotifyTrackName(name);
                    trackDto.setSpotifyArtistName(artist);
                    trackDto.setSpotifyAlbumName(albumName);
                    trackDto.setSpotifyAlbumArtUrl(albumArtUrl != null
                            ? albumArtUrl : t.getOrDefault("image", null));
                    trackDto.setSpotifyPreviewUrl(previewUrl);
                    trackDto.setSpotifyDurationMs(durationMs);
                    trackDto.setOrderIndex(i + 1);
                    playlistService.addTrack(trackDto, playlist);

                    // 응답 데이터
                    Map<String, Object> trackMap = new HashMap<>();
                    trackMap.put("id",        i);
                    trackMap.put("name",      name);
                    trackMap.put("artist",    artist);
                    trackMap.put("album",     albumName != null ? albumName : "");
                    trackMap.put("albumArt",  albumArtUrl != null
                            ? albumArtUrl : t.getOrDefault("image", null));
                    trackMap.put("previewUrl",  previewUrl);
                    trackMap.put("durationMs",  durationMs);
                    trackMap.put("spotifyTrackId", spotifyId);
                    trackList.add(trackMap);
                }
            }

            /* 4. 응답 구성 */
            Map<String, Object> emotion = new HashMap<>();
            emotion.put("primary",    ev.getPrimaryEmotion());
            emotion.put("secondary",  ev.getSecondaryEmotion());
            emotion.put("valence",    ev.getValence());
            emotion.put("arousal",    ev.getArousal());
            emotion.put("confidence", ev.getConfidence());
            emotion.put("tags",       ev.getLastfmTags());

            Map<String, Object> response = new HashMap<>();
            response.put("emotion",         emotion);
            response.put("tracks",          trackList);
            response.put("emotionVectorId", ev.getId());
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            System.err.println("[SyncAPI] 오류: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(500)
                    .body(Map.of("error",
                            e.getMessage() != null ? e.getMessage() : "서버 내부 오류"));
        }
    }

    /* ══ Spotify Client Credentials 토큰 발급 ═════════
       사용자 로그인 없이 검색/앨범아트/미리듣기 사용 가능
    ═══════════════════════════════════════════════ */
    private String getSpotifyToken() {
        if (spotifyClientId == null || spotifyClientId.isBlank()
                || spotifyClientSecret == null || spotifyClientSecret.isBlank()) {
            System.out.println("[Spotify] Client ID/Secret 미설정");
            return null;
        }

        // 캐시된 토큰이 유효하면 재사용
        if (_spotifyToken != null && _spotifyTokenExpiry != null
                && LocalDateTime.now().isBefore(_spotifyTokenExpiry)) {
            return _spotifyToken;
        }

        try {
            String credentials = spotifyClientId + ":" + spotifyClientSecret;
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

            _spotifyToken = (String) data.get("access_token");
            Integer expiresIn = (Integer) data.get("expires_in");
            _spotifyTokenExpiry = LocalDateTime.now()
                    .plusSeconds(expiresIn != null ? expiresIn - 60 : 3540);

            System.out.println("[Spotify] 토큰 발급 성공");
            return _spotifyToken;

        } catch (Exception e) {
            System.err.println("[Spotify] 토큰 발급 실패: " + e.getMessage());
            return null;
        }
    }

    /* ══ Spotify 트랙 검색 ════════════════════════════ */
    private Map<String, Object> searchSpotify(String trackName,
                                              String artistName,
                                              String token) {
        Map<String, Object> result = new HashMap<>();
        if (token == null) {
            System.out.println("[Spotify] 토큰 없음 — 검색 스킵 [" + trackName + "]");
            return result;
        }

        try {
            String query = "track:" + trackName + " artist:" + artistName;
            String encodedQuery = java.net.URLEncoder.encode(
                    query, "UTF-8");
            String url = "https://api.spotify.com/v1/search"
                    + "?q=" + encodedQuery
                    + "&type=track&limit=1&market=KR";

            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + token);
            HttpEntity<Void> req = new HttpEntity<>(headers);

            ResponseEntity<Map> res = restTemplate.exchange(
                    url, HttpMethod.GET, req, Map.class);

            Map<String, Object> body = res.getBody();
            if (body == null) {
                System.out.println("[Spotify] 응답 본문 없음 [" + trackName + "]");
                return result;
            }

            Map<String, Object> tracks =
                    (Map<String, Object>) body.get("tracks");
            if (tracks == null) {
                System.out.println("[Spotify] 'tracks' 필드 없음 [" + trackName + "]: " + body);
                return result;
            }

            List<Map<String, Object>> items =
                    (List<Map<String, Object>>) tracks.get("items");
            if (items == null || items.isEmpty()) {
                System.out.println("[Spotify] 검색 결과 0건 [" + trackName + " / " + artistName + "]");
                return result;
            }

            Map<String, Object> item = items.get(0);

            // 아티스트 유사도 검증 (오매칭 방지)
            List<Map<String, Object>> artistList =
                    (List<Map<String, Object>>) item.get("artists");
            String spotifyArtist = (artistList != null && !artistList.isEmpty())
                    ? (String) artistList.get(0).get("name") : null;
            if (!artistMatches(artistName, spotifyArtist)) {
                System.out.println("[Spotify] 아티스트 불일치 스킵: "
                        + artistName + " vs " + spotifyArtist);
                return result;
            }

            // 트랙 ID + 미리듣기 URL
            result.put("id",         item.get("id"));
            result.put("previewUrl", item.get("preview_url"));
            result.put("artistName", spotifyArtist);

            // 앨범 아트
            Map<String, Object> album =
                    (Map<String, Object>) item.get("album");
            if (album != null) {
                result.put("albumName", album.get("name"));

                List<Map<String, Object>> images =
                        (List<Map<String, Object>>) album.get("images");
                if (images != null && !images.isEmpty()) {
                    // 가장 큰 이미지 사용
                    result.put("albumArt", images.get(0).get("url"));
                }
            }

            // 재생 시간
            result.put("durationMs", item.get("duration_ms"));
            System.out.println("[Spotify] 매칭 성공 [" + trackName + " / " + spotifyArtist
                    + "] previewUrl=" + (item.get("preview_url") != null)
                    + " durationMs=" + item.get("duration_ms"));

        } catch (Exception e) {
            System.err.println("[Spotify] 검색 실패 [" + trackName + "]: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        return result;
    }

    /* ══ iTunes 검색 — Spotify 매칭 실패/일부 정보 누락 시 보완용 (무료, 인증 불필요) ══ */
    private Map<String, Object> searchItunes(String trackName, String artistName) {
        Map<String, Object> result = new HashMap<>();
        try {
            String query = trackName + " " + artistName;
            String encoded = java.net.URLEncoder.encode(query, "UTF-8");
            String url = "https://itunes.apple.com/search?term=" + encoded
                    + "&media=music&entity=song&limit=1";

            ResponseEntity<Map> res = restTemplate.getForEntity(url, Map.class);
            Map<String, Object> body = res.getBody();
            if (body == null) return result;

            List<Map<String, Object>> items =
                    (List<Map<String, Object>>) body.get("results");
            if (items == null || items.isEmpty()) {
                System.out.println("[iTunes] 대체 검색 결과 0건 [" + trackName + " / " + artistName + "]");
                return result;
            }

            Map<String, Object> item = items.get(0);
            String itunesArtist = (String) item.get("artistName");
            if (!artistMatches(artistName, itunesArtist)) {
                System.out.println("[iTunes] 아티스트 불일치 스킵: " + artistName + " vs " + itunesArtist);
                return result;
            }

            String art = (String) item.get("artworkUrl100");
            if (art != null) art = art.replace("100x100bb", "600x600bb");

            result.put("albumArt",   art);
            result.put("previewUrl", item.get("previewUrl"));
            result.put("durationMs", item.get("trackTimeMillis"));
            result.put("albumName",  item.get("collectionName"));
            System.out.println("[iTunes] 대체 매칭 성공 [" + trackName + " / " + itunesArtist + "]");

        } catch (Exception e) {
            System.err.println("[iTunes] 대체 검색 실패 [" + trackName + "]: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        return result;
    }

    /* ══ Last.fm 태그 기반 트랙 검색 ═════════════════ */
    private List<Map<String, String>> searchLastFm(List<String> tags) {
        List<Map<String, String>> result = new ArrayList<>();
        if (lastfmApiKey == null || lastfmApiKey.isBlank()
                || lastfmApiKey.equals("your_lastfm_api_key_here")) {
            System.out.println("[LastFM] API Key 미설정");
            return result;
        }
        for (String tag : tags) {
            try {
                // 매 요청마다 다른 페이지 → 다양한 곡 추천
                int page = new Random().nextInt(5) + 1;
                String url = "http://ws.audioscrobbler.com/2.0/"
                        + "?method=tag.gettoptracks"
                        + "&tag=" + tag.replace(" ", "+")
                        + "&api_key=" + lastfmApiKey
                        + "&format=json&limit=10"
                        + "&page=" + page;

                ResponseEntity<Map> res =
                        restTemplate.getForEntity(url, Map.class);
                Map<String, Object> body = res.getBody();
                if (body == null) continue;

                Map<String, Object> tracks =
                        (Map<String, Object>) body.get("tracks");
                if (tracks == null) continue;

                List<Map<String, Object>> list =
                        (List<Map<String, Object>>) tracks.get("track");
                if (list == null) continue;

                for (Map<String, Object> t : list) {
                    String name = (String) t.get("name");
                    Map<String, Object> artist =
                            (Map<String, Object>) t.get("artist");
                    String artistName = artist != null
                            ? (String) artist.get("name") : "Unknown";

                    String image = null;
                    List<Map<String, Object>> images =
                            (List<Map<String, Object>>) t.get("image");
                    if (images != null) {
                        for (Map<String, Object> img : images) {
                            if ("large".equals(img.get("size"))
                                    || "extralarge".equals(img.get("size"))) {
                                String src = (String) img.get("#text");
                                if (src != null && !src.isBlank())
                                    image = src;
                            }
                        }
                    }

                    if (name != null && !name.isBlank()) {
                        Map<String, String> track = new HashMap<>();
                        track.put("name",   name);
                        track.put("artist", artistName);
                        if (image != null) track.put("image", image);
                        result.add(track);
                    }
                    if (result.size() >= 15) break;
                }
            } catch (Exception e) {
                System.err.println("[LastFM] 오류 [" + tag + "]: "
                        + e.getMessage());
            }
            if (result.size() >= 15) break;
        }
        Collections.shuffle(result); // 수집 후 섞기
        return result;
    }

    /* ══ 유틸리티 ════════════════════════════════════ */

    /** 아티스트명 유사도 검증 - Levenshtein 80% 이상만 허용 (src2 방식) */
    private static boolean artistMatches(String a, String b) {
        if (a == null || b == null) return false;
        String na = normalizeArtist(a);
        String nb = normalizeArtist(b);
        if (na.isEmpty() || nb.isEmpty()) return false;
        int maxLen = Math.max(na.length(), nb.length());
        double similarity = (double)(maxLen - levenshtein(na, nb)) / maxLen;
        return similarity >= 0.80;
    }

    private static String normalizeArtist(String name) {
        String s = name.toLowerCase(java.util.Locale.ROOT).trim();
        return s.startsWith("the ") ? s.substring(4) : s;
    }

    private static int levenshtein(String a, String b) {
        int m = a.length(), n = b.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 0; i <= m; i++) dp[i][0] = i;
        for (int j = 0; j <= n; j++) dp[0][j] = j;
        for (int i = 1; i <= m; i++)
            for (int j = 1; j <= n; j++)
                dp[i][j] = (a.charAt(i-1) == b.charAt(j-1))
                        ? dp[i-1][j-1]
                        : 1 + Math.min(dp[i-1][j-1],
                                Math.min(dp[i-1][j], dp[i][j-1]));
        return dp[m][n];
    }

    private List<String> parseTags(String json) {
        List<String> result = new ArrayList<>();
        if (json == null || json.isBlank()) return result;
        String cleaned = json.trim().replaceAll("^\\[|]$", "").trim();
        if (cleaned.isEmpty()) return result;
        for (String item : cleaned.split(",")) {
            String tag = item.trim().replaceAll("^\"|\"$", "").trim();
            if (!tag.isEmpty()) result.add(tag);
        }
        return result;
    }

    /* ══ 기타 엔드포인트 ═════════════════════════════ */
    @PostMapping("/analyze")
    public ResponseEntity<EmotionVectorEntity> analyze(
            @RequestBody EmotionVectorDTO dto, HttpSession session) {
        UserEntity loginUser =
                (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        EmotionVectorEntity result =
                emotionVectorService.analyze(dto, loginUser);
        if (result == null)
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    @GetMapping("/emotion-history")
    public ResponseEntity<List<EmotionVectorEntity>> emotionHistory(
            HttpSession session) {
        UserEntity loginUser =
                (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(emotionVectorService.getHistory(loginUser));
    }

    @GetMapping("/test-clip")
    public ResponseEntity<String> testClip(HttpSession session) {
        UserEntity loginUser =
                (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        EmotionVectorDTO dto = new EmotionVectorDTO();
        dto.setInputType("text");
        dto.setInputText("비 오는 날 창가에서 혼자 커피 마시는 기분");
        EmotionVectorEntity result =
                emotionVectorService.analyze(dto, loginUser);
        if (result == null)
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body("CLIP 서버 호출 실패");
        return ResponseEntity.ok("감정: " + result.getPrimaryEmotion()
                + " | 태그: " + result.getLastfmTags());
    }
}
