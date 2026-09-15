package com.graduate.Sync.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.graduate.Sync.dto.EmotionVectorDTO;
import com.graduate.Sync.dto.PlaylistDTO;
import com.graduate.Sync.dto.PlaylistTrackDTO;
import com.graduate.Sync.entity.EmotionVectorEntity;
import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.EmotionVectorService;
import com.graduate.Sync.service.PlaylistService;
import com.graduate.Sync.service.SpotifyAppTokenService;
import com.graduate.Sync.util.MatchUtils;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;
import java.util.Random;
import java.util.*;

@RestController
@RequestMapping("/api/sync")
public class SyncApiController {

    @Autowired private EmotionVectorService emotionVectorService;
    @Autowired private PlaylistService      playlistService;
    @Autowired private RestTemplate         restTemplate;
    @Autowired private ObjectMapper         objectMapper;
    @Autowired private SpotifyAppTokenService spotifyAppTokenService;

    @Value("${lastfm.api.key:}")
    private String lastfmApiKey;

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
            String spotifyToken = spotifyAppTokenService.getToken();
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

                    // 재생 정보(미리듣기/재생시간)는 아티스트가 확실히 일치할 때만 신뢰해야 하지만,
                    // 앨범아트는 틀려도 재생에 영향이 없으므로 그래도 비어있으면 아티스트 일치 여부와
                    // 무관하게 최후의 시각적 보완으로 채워 넣는다.
                    if (spotifyData.get("albumArt") == null) {
                        String fallbackArt = searchItunesArtworkOnly(name, artist);
                        if (fallbackArt != null) spotifyData.put("albumArt", fallbackArt);
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
            if (!MatchUtils.artistMatches(artistName, spotifyArtist)) {
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

            // iTunes는 Content-Type을 application/json이 아닌 text/javascript로 내려주기 때문에
            // RestTemplate의 기본 Jackson 컨버터가 이를 매칭하지 못해 UnknownContentTypeException이 발생함.
            // 문자열로 받은 뒤 직접 JSON으로 파싱해서 content-type 협상 문제를 우회함.
            String rawJson = restTemplate.getForObject(url, String.class);
            if (rawJson == null || rawJson.isBlank()) return result;
            Map<String, Object> body = objectMapper.readValue(rawJson, Map.class);
            if (body == null) return result;

            List<Map<String, Object>> items =
                    (List<Map<String, Object>>) body.get("results");
            if (items == null || items.isEmpty()) {
                System.out.println("[iTunes] 대체 검색 결과 0건 [" + trackName + " / " + artistName + "]");
                return result;
            }

            Map<String, Object> item = items.get(0);
            String itunesArtist = (String) item.get("artistName");
            if (!MatchUtils.artistMatches(artistName, itunesArtist)) {
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

    /* ══ iTunes 아트워크 전용 최후 보완 — 재생 정보(previewUrl/재생시간)는 오매칭 방지를 위해
       아티스트가 확실히 일치할 때만 쓰지만, 앨범아트는 틀려도 재생 자체엔 영향이 없으므로
       아티스트 일치 여부와 무관하게 검색 결과 1건의 이미지만 시각적으로 채워 넣는다 ══ */
    private String searchItunesArtworkOnly(String trackName, String artistName) {
        try {
            String query = trackName + " " + artistName;
            String encoded = java.net.URLEncoder.encode(query, "UTF-8");
            String url = "https://itunes.apple.com/search?term=" + encoded
                    + "&media=music&entity=song&limit=1";

            String rawJson = restTemplate.getForObject(url, String.class);
            if (rawJson == null || rawJson.isBlank()) return null;
            Map<String, Object> body = objectMapper.readValue(rawJson, Map.class);
            if (body == null) return null;

            List<Map<String, Object>> items =
                    (List<Map<String, Object>>) body.get("results");
            if (items == null || items.isEmpty()) return null;

            String art = (String) items.get(0).get("artworkUrl100");
            if (art != null) art = art.replace("100x100bb", "600x600bb");
            return art;

        } catch (Exception e) {
            System.err.println("[iTunes] 아트워크 전용 보완 실패 [" + trackName + "]: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
            return null;
        }
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
