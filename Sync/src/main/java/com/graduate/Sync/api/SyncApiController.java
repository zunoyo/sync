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
import com.graduate.Sync.util.ArtUtils;
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
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

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
            // 사용자가 장르를 골랐으면 그 장르 안에서 감정에 어울리는 곡을 찾고,
            // 고르지 않았으면 기존처럼 감정 태그 전체에서 추천한다.
            List<String> genres = sanitizeGenres(dto.getGenres());
            List<Map<String, String>> lastfmTracks = genres.isEmpty()
                    ? searchLastFm(tags)
                    : searchLastFmInGenres(tags, genres);

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
                    Map<String, Object> spotifyData = searchSpotify(name, artist, spotifyToken);
                    Map<String, Object> itunesData  = Collections.emptyMap();

                    // iTunes: Spotify 정보가 비었거나(미리듣기/재생시간/앨범아트) 약한 후보라 교차검증이 필요할 때 조회
                    boolean spWeak = Boolean.TRUE.equals(spotifyData.get("weak"));
                    if (spotifyData.get("previewUrl") == null
                            || spotifyData.get("durationMs") == null
                            || spotifyData.get("albumArt") == null || spWeak) {
                        itunesData = searchItunes(name, artist);
                    }
                    boolean itWeak = Boolean.TRUE.equals(itunesData.get("weak"));

                    // 약한 후보 판정 (원본 값 기준으로 양쪽을 동시에 판단)
                    //  · cross : 한글↔영문 표기라 아티스트 이름 확인 불가 → 상대가 강한 후보이고 재생시간(±3초)이
                    //            일치하거나, 상대도 약하면 재생시간 일치 + 두 아티스트 이름이 서로 맞아야 인정.
                    //            (같은 곡명의 다른 가수 버전을 걸러내기 위함)
                    //  · 곡명 불일치 : 아티스트는 확인됨 → 상대와 재생시간(±3초) 일치, 상대가 없으면
                    //            결과 안에서 아티스트 일치 곡이 하나뿐일 때 인정.
                    // 곡명이 달라서 약한 후보가 된 경우(번역 제목 등), Last.fm이 알려주는 재생시간도 근거로 쓴다.
                    Long lfDur = null;
                    if (spWeak || itWeak) {
                        lfDur = fetchLastFmDurationMs(artist, name);
                    }
                    boolean spKeep = !spWeak || acceptWeak(spotifyData, itunesData, lfDur);
                    boolean itKeep = !itWeak || acceptWeak(itunesData, spotifyData, lfDur);
                    if (!spKeep) {
                        System.out.println("[Spotify] 약한 후보 폐기 [" + name + " / " + artist + " → "
                                + spotifyData.get("matchedTitle") + " / " + spotifyData.get("artistName") + "]");
                        spotifyData = new HashMap<>();
                    }
                    if (!itKeep) {
                        System.out.println("[iTunes] 약한 후보 폐기 [" + name + " / " + artist + " → "
                                + itunesData.get("matchedTitle") + " / " + itunesData.get("artistName") + "]");
                        itunesData = new HashMap<>();
                    }
                    // 둘 다 확정인데 재생시간이 10초 넘게 다르면 다른 녹음(리믹스/듀엣 등)이므로
                    // iTunes 미리듣기·재생시간은 쓰지 않는다. (앨범아트는 Spotify 것이 있으면 그대로)
                    if (spotifyData.get("id") != null && itunesData.get("durationMs") instanceof Number
                            && spotifyData.get("durationMs") instanceof Number
                            && Math.abs(((Number) spotifyData.get("durationMs")).longValue()
                                      - ((Number) itunesData.get("durationMs")).longValue()) > 10000) {
                        itunesData = new HashMap<>(itunesData);
                        itunesData.remove("previewUrl");
                        itunesData.remove("durationMs");
                        System.out.println("[iTunes] 재생시간 불일치 — 미리듣기 제외 [" + name + "]");
                    }
                    spotifyData.putIfAbsent("albumArt",   itunesData.get("albumArt"));
                    spotifyData.putIfAbsent("previewUrl", itunesData.get("previewUrl"));
                    spotifyData.putIfAbsent("durationMs", itunesData.get("durationMs"));
                    spotifyData.putIfAbsent("albumName",  itunesData.get("albumName"));

                    // 앨범아트는 아티스트가 일치한 결과에서만 사용한다. (예전에는 일치 여부와 무관하게
                    // iTunes 1순위 커버를 붙여서 전혀 다른 아티스트의 앨범 이미지가 표시되는 문제가 있었음)
                    // 비어 있으면 아래에서 Last.fm 이미지, 그것도 없으면 프론트가 기본 아이콘/이름 검색 보강을 쓴다.

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
            // 이번 요청의 신뢰도(confidence)와는 다른 값 — EmoSet으로 학습된
            // 모델 자체의 전반적 검증 정확도. 텍스트만 분석했거나 아직 모델을
            // 학습 안 했으면 null(DB에는 저장 안 하고 이 응답에만 실어 보냄)
            emotion.put("modelValAccuracy", dto.getModelValAccuracy());
            // 이미지 단독 입력의 '확실/보통/애매'(1·2위 확률 차이 기준). 텍스트·복합은 null
            emotion.put("reliability", dto.getReliability());

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

    /* ══ Spotify 트랙 검색 ════════════════════════════
       - URL은 URI.create 로 넘겨 이중 인코딩을 막는다.
       - 1단계: 상위 5건 중 아티스트가 일치하는 곡 (여러 개면 곡명이 가장 비슷한 것)
       - 2단계(폴백): 곡명을 정제("(…)", "- …", feat. 제거)해서 곡명 중심으로 재검색.
         오매칭 방지를 위해 곡명 유사도 ≥ 0.6 을 요구하고, 한글↔영문 표기라 아티스트 이름을
         비교할 수 없는 경우엔 곡명이 거의 같을 때(≥ 0.9)만 인정한다.
    ═══════════════════════════════════════════════ */
    private static final double FALLBACK_TITLE_SIM = 0.6;
    private static final double CROSS_SCRIPT_TITLE_SIM = 0.9;

    private Map<String, Object> searchSpotify(String trackName,
                                              String artistName,
                                              String token) {
        Map<String, Object> result = new HashMap<>();
        if (token == null) {
            System.out.println("[Spotify] 토큰 없음 — 검색 스킵 [" + trackName + "]");
            return result;
        }

        try {
            String clean = cleanQueryTitle(trackName);
            // {검색어, 폴백 여부}
            List<Object[]> stages = new ArrayList<>();
            stages.add(new Object[]{"track:" + trackName + " artist:" + artistName, false});
            stages.add(new Object[]{trackName + " " + artistName, false});
            if (!clean.isEmpty() && !clean.equalsIgnoreCase(trackName)) {
                stages.add(new Object[]{clean + " " + artistName, true});
            }
            for (String part : MatchUtils.titleParts(trackName)) {
                stages.add(new Object[]{part + " " + artistName, true});
            }
            stages.add(new Object[]{"track:" + (clean.isEmpty() ? trackName : clean), true});

            Map<String, Object> weakHold = null;   // 아티스트는 맞지만 곡명이 다른 후보(교차검증 대상)
            for (Object[] st : stages) {
                boolean fallback = (Boolean) st[1];
                List<Map<String, Object>> items = spotifySearchItems((String) st[0], token);
                Map<String, Object> best = null;
                String bestArtist = null;
                double bestSim = -1;
                boolean bestWeak = true, bestCross = false;
                int okCount = 0;
                for (Map<String, Object> item : items) {
                    List<Map<String, Object>> artistList = (List<Map<String, Object>>) item.get("artists");
                    if (artistList == null) continue;
                    if (MatchUtils.isUnwantedVariant(trackName, (String) item.get("name"))) continue;
                    if (item.get("duration_ms") instanceof Number
                            && ((Number) item.get("duration_ms")).longValue() < MIN_TRACK_MS) continue;   // 인터루드/짧은 버전
                    double sim = MatchUtils.titleSimilarity(trackName, (String) item.get("name"));
                    for (Map<String, Object> a : artistList) {
                        String n = (String) a.get("name");
                        boolean strict = MatchUtils.artistMatches(artistName, n);
                        boolean cross = !strict && fallback && MatchUtils.crossScript(artistName, n)
                                && sim >= CROSS_SCRIPT_TITLE_SIM;
                        if (!strict && !cross) continue;
                        if (strict) okCount++;
                        // 강한 후보: 아티스트 일치 + 곡명 유사. 그 외(곡명 다름·한영 표기 차이)는 약한 후보.
                        boolean weak = cross || sim < FALLBACK_TITLE_SIM;
                        if (fallback && strict && sim < FALLBACK_TITLE_SIM) break;   // 폴백은 곡명 게이트
                        boolean better = best == null || (bestWeak && !weak) || (bestWeak == weak && sim > bestSim);
                        if (better) { best = item; bestArtist = n; bestSim = sim; bestWeak = weak; bestCross = cross; }
                        break;
                    }
                }
                if (best == null) continue;

                Map<String, Object> r = new HashMap<>();
                r.put("id",         best.get("id"));
                r.put("previewUrl", best.get("preview_url"));
                r.put("artistName", bestArtist);
                Map<String, Object> album = (Map<String, Object>) best.get("album");
                if (album != null) {
                    r.put("albumName", album.get("name"));
                    List<Map<String, Object>> images = (List<Map<String, Object>>) album.get("images");
                    if (images != null && !images.isEmpty()) r.put("albumArt", images.get(0).get("url"));
                }
                r.put("durationMs", best.get("duration_ms"));
                r.put("weak", bestWeak);
                r.put("cross", bestCross);
                r.put("okCount", okCount);
                r.put("matchedTitle", best.get("name"));
                if (bestWeak) { if (weakHold == null) weakHold = r; continue; }

                System.out.println("[Spotify] 매칭 성공" + (fallback ? "(폴백)" : "") + " [" + trackName + " / "
                        + bestArtist + " → " + best.get("name") + "] previewUrl=" + (best.get("preview_url") != null)
                        + " durationMs=" + best.get("duration_ms"));
                return r;
            }
            if (weakHold != null) {
                System.out.println("[Spotify] 약한 후보(교차검증 대기) [" + trackName + " / " + artistName
                        + " → " + weakHold.get("matchedTitle") + " / " + weakHold.get("artistName") + "]");
                return weakHold;
            }
            System.out.println("[Spotify] 일치하는 아티스트 없음 [" + trackName + " / " + artistName + "]");
        } catch (Exception e) {
            System.err.println("[Spotify] 검색 실패 [" + trackName + "]: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private static boolean acceptWeak(Map<String, Object> self, Map<String, Object> other, Long lastfmDurMs) {
        boolean otherPresent = other != null && other.get("durationMs") != null;
        boolean otherWeak = otherPresent && Boolean.TRUE.equals(other.get("weak"));
        boolean agree = otherPresent && durationAgrees(self.get("durationMs"), other.get("durationMs"));
        if (Boolean.TRUE.equals(self.get("cross"))) {
            if (!otherPresent) return false;
            if (!otherWeak) return agree;
            // 두 서비스가 같은 (엉뚱한) 가수를 돌려주는 경우를 막기 위해 Last.fm 재생시간 일치까지 요구한다.
            return agree && MatchUtils.artistMatches((String) self.get("artistName"), (String) other.get("artistName"))
                    && lastfmDurMs != null && durationAgrees(self.get("durationMs"), lastfmDurMs);
        }
        if (otherPresent) return agree;
        // 곡명이 다른데 상대 서비스에도 없으면: Last.fm 재생시간과 ±3초로 맞을 때만 인정
        return lastfmDurMs != null && durationAgrees(self.get("durationMs"), lastfmDurMs);
    }

    /** Last.fm track.getInfo 의 재생시간(ms). 정보가 없거나(0) 실패하면 null. */
    private Long fetchLastFmDurationMs(String artist, String track) {
        if (lastfmApiKey == null || lastfmApiKey.isBlank()
                || lastfmApiKey.equals("your_lastfm_api_key_here")) return null;
        try {
            String url = "http://ws.audioscrobbler.com/2.0/?method=track.getinfo"
                    + "&artist=" + java.net.URLEncoder.encode(artist, "UTF-8")
                    + "&track=" + java.net.URLEncoder.encode(track, "UTF-8")
                    + "&autocorrect=1&api_key=" + lastfmApiKey + "&format=json";
            ResponseEntity<Map> res = restTemplate.getForEntity(java.net.URI.create(url), Map.class);
            Map<String, Object> body = res.getBody();
            if (body == null) return null;
            Map<String, Object> t = (Map<String, Object>) body.get("track");
            if (t == null || t.get("duration") == null) return null;
            long ms = Long.parseLong(String.valueOf(t.get("duration")));
            System.out.println("[LastFM] 재생시간 조회 [" + track + " / " + artist + "] " + ms + "ms");
            return ms > 0 ? ms : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean durationAgrees(Object a, Object b) {
        if (!(a instanceof Number) || !(b instanceof Number)) return false;
        return Math.abs(((Number) a).longValue() - ((Number) b).longValue()) <= 3000;
    }

    /** 곡명 꼬리표 제거: "Lonely (없구나)" → "Lonely", "Lips - WINTER Solo" → "Lips" */
    private String cleanQueryTitle(String t) {
        if (t == null) return "";
        return t.replaceAll("^\\s*\\d{1,3}\\.\\s*", "")
                .replaceAll("\\([^)]*\\)|\\[[^\\]]*\\]", " ")
                .replaceAll("\\s-\\s.*$", " ")
                .replaceAll("(?i)\\b(feat|ft)\\.?\\s.*$", " ")
                .replaceAll("\\s+", " ").trim();
    }

    /** Spotify /v1/search (type=track) 상위 5건. 실패 시 빈 리스트. */
    private List<Map<String, Object>> spotifySearchItems(String query, String token) throws Exception {
        String url = "https://api.spotify.com/v1/search"
                + "?q=" + java.net.URLEncoder.encode(query, "UTF-8")
                + "&type=track&limit=5&market=KR";
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        ResponseEntity<Map> res = restTemplate.exchange(
                java.net.URI.create(url), HttpMethod.GET, new HttpEntity<Void>(headers), Map.class);
        Map<String, Object> body = res.getBody();
        if (body == null) return Collections.emptyList();
        Map<String, Object> tracks = (Map<String, Object>) body.get("tracks");
        if (tracks == null) return Collections.emptyList();
        List<Map<String, Object>> items = (List<Map<String, Object>>) tracks.get("items");
        return items != null ? items : Collections.emptyList();
    }

    /* ══ iTunes 검색 — Spotify 매칭 실패/일부 정보 누락 시 보완용 (무료, 인증 불필요) ══
       Spotify와 같은 규칙: 1단계 아티스트 일치, 2단계 폴백(정제 곡명 + 곡명 유사도 게이트). */
    private Map<String, Object> searchItunes(String trackName, String artistName) {
        Map<String, Object> result = new HashMap<>();
        try {
            String clean = cleanQueryTitle(trackName);
            List<Object[]> stages = new ArrayList<>();
            stages.add(new Object[]{trackName + " " + artistName, false});
            if (!clean.isEmpty() && !clean.equalsIgnoreCase(trackName)) {
                stages.add(new Object[]{clean + " " + artistName, true});
            }
            for (String part : MatchUtils.titleParts(trackName)) {
                stages.add(new Object[]{part + " " + artistName, true});
            }
            stages.add(new Object[]{clean.isEmpty() ? trackName : clean, true});

            Map<String, Object> weakHold = null;
            for (Object[] st : stages) {
                boolean fallback = (Boolean) st[1];
                List<Map<String, Object>> items = itunesSearchItems((String) st[0]);
                Map<String, Object> best = null;
                double bestSim = -1;
                boolean bestWeak = true, bestCross = false;
                int okCount = 0;
                for (Map<String, Object> item : items) {
                    if (MatchUtils.isUnwantedVariant(trackName, (String) item.get("trackName"))) continue;
                    if (item.get("trackTimeMillis") instanceof Number
                            && ((Number) item.get("trackTimeMillis")).longValue() < MIN_TRACK_MS) continue;
                    String itunesArtist = (String) item.get("artistName");
                    double sim = MatchUtils.titleSimilarity(trackName, (String) item.get("trackName"));
                    boolean strict = MatchUtils.artistMatches(artistName, itunesArtist);
                    boolean cross = !strict && fallback && MatchUtils.crossScript(artistName, itunesArtist)
                            && sim >= CROSS_SCRIPT_TITLE_SIM;
                    if (!strict && !cross) continue;
                    if (strict) okCount++;
                    boolean weak = cross || sim < FALLBACK_TITLE_SIM;
                    if (fallback && strict && sim < FALLBACK_TITLE_SIM) continue;
                    boolean better = best == null || (bestWeak && !weak) || (bestWeak == weak && sim > bestSim);
                    if (better) { best = item; bestSim = sim; bestWeak = weak; bestCross = cross; }
                }
                if (best == null) continue;

                String art = (String) best.get("artworkUrl100");
                if (art != null) art = ArtUtils.hiResArt(art, 600);
                Map<String, Object> r = new HashMap<>();
                r.put("albumArt",   art);
                r.put("previewUrl", best.get("previewUrl"));
                r.put("durationMs", best.get("trackTimeMillis"));
                r.put("albumName",  best.get("collectionName"));
                r.put("weak", bestWeak);
                r.put("cross", bestCross);
                r.put("okCount", okCount);
                r.put("matchedTitle", best.get("trackName"));
                r.put("artistName", best.get("artistName"));
                if (bestWeak) { if (weakHold == null) weakHold = r; continue; }
                System.out.println("[iTunes] 대체 매칭 성공" + (fallback ? "(폴백)" : "") + " [" + trackName + " / "
                        + best.get("artistName") + " → " + best.get("trackName") + "]");
                return r;
            }
            if (weakHold != null) {
                System.out.println("[iTunes] 약한 후보(교차검증 대기) [" + trackName + " / " + artistName
                        + " → " + weakHold.get("matchedTitle") + " / " + weakHold.get("artistName") + "]");
                return weakHold;
            }
            System.out.println("[iTunes] 일치하는 아티스트 없음 [" + trackName + " / " + artistName + "]");
        } catch (Exception e) {
            System.err.println("[iTunes] 대체 검색 실패 [" + trackName + "]: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        return result;
    }

    private List<Map<String, Object>> itunesSearchItems(String query) throws Exception {
        String url = "https://itunes.apple.com/search?term="
                + java.net.URLEncoder.encode(query, "UTF-8")
                + "&media=music&entity=song&limit=5";
        // iTunes는 Content-Type을 text/javascript로 내려주므로 문자열로 받아 직접 파싱한다.
        String rawJson = restTemplate.getForObject(java.net.URI.create(url), String.class);
        if (rawJson == null || rawJson.isBlank()) return Collections.emptyList();
        Map<String, Object> body = objectMapper.readValue(rawJson, Map.class);
        List<Map<String, Object>> items = body == null ? null : (List<Map<String, Object>>) body.get("results");
        return items != null ? items : Collections.emptyList();
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

    /* ══ 장르 지정 추천 ═══════════════════════════════
       Last.fm은 "장르 ∩ 감정" 교집합 검색을 지원하지 않으므로
       ① 선택한 장르 태그의 인기곡을 후보로 모으고
       ② 후보마다 곡 자체의 태그(track.gettoptags)를 조회해 감정 태그와 겹치는 정도로 점수를 매겨
       ③ 점수가 높은 곡부터 고른다. 장르는 항상 지켜지고, 감정은 "가장 어울리는 순"으로 반영된다.
    ═══════════════════════════════════════════════ */
    private static final int GENRE_CANDIDATE_LIMIT = 48;
    // 화면의 장르 키 → 실제로 조회할 Last.fm 태그들. Last.fm은 태그 표기가 제각각이라 별칭을 함께 쓴다.
    private static final Map<String, List<String>> GENRE_TAGS = Map.ofEntries(
            Map.entry("k-ballad", List.of("korean ballad", "k-ballad")),
            Map.entry("k-pop",    List.of("k-pop", "kpop")),
            Map.entry("rnb",      List.of("rnb", "r&b")),
            Map.entry("hip-hop",  List.of("hip-hop", "hip hop")),
            Map.entry("lo-fi",    List.of("lo-fi", "lofi")));
    // 곡의 상위 태그에서 "정말 이 장르인지" 확인할 때 쓰는 키워드(조회 태그 + 보조 키워드)
    private static final Map<String, List<String>> GENRE_EXTRA_TERMS = Map.of(
            "k-ballad", List.of("korean"));
    private static final int GENRE_TAG_MATCH_BONUS = 4;
    private static final int GENRE_RESULT_LIMIT    = 15;
    private static final int GENRE_MAX_PER_ARTIST  = 2;
    private static final long MIN_TRACK_MS = 90_000;   // 이보다 짧은 후보(인터루드·짧은 버전)는 매칭에서 제외
    private final ExecutorService lastfmPool = Executors.newFixedThreadPool(6);

    private List<String> sanitizeGenres(List<String> raw) {
        if (raw == null) return Collections.emptyList();
        return raw.stream()
                .filter(g -> g != null)
                .map(g -> g.trim().toLowerCase())
                .filter(g -> g.matches("[a-z0-9&\\- ]{1,30}"))
                .distinct()
                .limit(5)
                .collect(Collectors.toList());
    }

    private List<Map<String, String>> searchLastFmInGenres(List<String> emotionTags, List<String> genres) {
        if (lastfmApiKey == null || lastfmApiKey.isBlank()
                || lastfmApiKey.equals("your_lastfm_api_key_here")) {
            System.out.println("[LastFM] API Key 미설정");
            return new ArrayList<>();
        }

        // 장르 키 → Last.fm 조회 태그(별칭 포함) / 장르 확인용 키워드
        Set<String> fetchTags  = new LinkedHashSet<>();
        Set<String> genreTerms = new LinkedHashSet<>();
        for (String g : genres) {
            List<String> tagsForGenre = GENRE_TAGS.getOrDefault(g, List.of(g));
            fetchTags.addAll(tagsForGenre);
            genreTerms.addAll(tagsForGenre);
            genreTerms.addAll(GENRE_EXTRA_TERMS.getOrDefault(g, List.of()));
        }

        // 감정 태그에서 장르 이름과 겹치는 것(예: "pop")은 구분력이 없으므로 점수 계산에서 제외
        Set<String> emotionKeys = emotionTags.stream()
                .map(t -> t.toLowerCase().trim())
                .filter(t -> !t.isEmpty() && !genreTerms.contains(t))
                .collect(Collectors.toCollection(LinkedHashSet::new));

        // ① 장르 후보 수집 — 장르마다 무작위 페이지 2곳(1~4) 병렬 조회
        Random rnd = new Random();
        List<CompletableFuture<List<Map<String, String>>>> fetches = new ArrayList<>();
        int pagesPerTag = fetchTags.size() > genres.size() ? 1 : 2; // 별칭이 있으면 태그당 1페이지로 호출 수 제한
        for (String genreTag : fetchTags) {
            List<Integer> pages = new ArrayList<>(List.of(1, 2, 3, 4));
            Collections.shuffle(pages, rnd);
            for (int page : pages.subList(0, pagesPerTag)) {
                fetches.add(CompletableFuture.supplyAsync(
                        () -> fetchTagTracks(genreTag, page, 50), lastfmPool));
            }
        }
        Map<String, Map<String, String>> candidates = new LinkedHashMap<>();
        for (CompletableFuture<List<Map<String, String>>> f : fetches) {
            for (Map<String, String> t : f.join()) {
                if (MatchUtils.looksGarbled(t.get("name")) || MatchUtils.looksGarbled(t.get("artist"))) continue;   // 인코딩 깨진 항목
                if (MatchUtils.hasVariantMarker(t.get("name"))) continue;   // 인스트루멘탈/MR 곡은 후보에서 제외
                String key = (t.get("artist") + "|" + t.get("name")).toLowerCase();
                candidates.putIfAbsent(key, t);
            }
        }
        List<Map<String, String>> pool = new ArrayList<>(candidates.values());
        Collections.shuffle(pool, rnd);
        // 점수 계산 대상(48곡)을 고르기 전에 아티스트당 최대 2곡으로 다양화한다.
        // (K-발라드처럼 특정 가수의 곡이 후보에 몰리면, 뒤에서 제한을 걸어도 15곡을 못 채워 다시 몰리기 때문)
        Map<String, Integer> poolPerArtist = new HashMap<>();
        List<Map<String, String>> diverse = new ArrayList<>();
        for (Map<String, String> t : pool) {
            String ak = MatchUtils.normalizeArtist(String.valueOf(t.get("artist")));
            if (poolPerArtist.merge(ak, 1, Integer::sum) > GENRE_MAX_PER_ARTIST) continue;
            diverse.add(t);
            if (diverse.size() >= GENRE_CANDIDATE_LIMIT) break;
        }
        pool = diverse;

        // ② 곡별 태그 조회로 감정 점수 계산(병렬). 조회 실패는 0점으로 처리해 장르 결과만이라도 돌려준다.
        List<CompletableFuture<Integer>> scores = new ArrayList<>();
        for (Map<String, String> t : pool) {
            scores.add(CompletableFuture.supplyAsync(
                    () -> trackScore(t.get("name"), t.get("artist"), emotionKeys, genreTerms), lastfmPool));
        }
        List<Map<String, String>> ranked = new ArrayList<>();
        List<Integer> rankedScores = new ArrayList<>();
        for (int i = 0; i < pool.size(); i++) {
            ranked.add(pool.get(i));
            rankedScores.add(scores.get(i).join());
        }
        List<Integer> order = new ArrayList<>();
        for (int i = 0; i < ranked.size(); i++) order.add(i);
        order.sort((a, b) -> Integer.compare(rankedScores.get(b), rankedScores.get(a))); // 안정 정렬: 동점은 위에서 섞은 순서 유지

        // 한 아티스트가 결과를 독차지하지 않도록 아티스트당 최대 GENRE_MAX_PER_ARTIST곡.
        // 후보가 모자라 15곡을 못 채우면 2차로 제한 없이 남은 상위 곡을 채운다.
        List<Map<String, String>> result = new ArrayList<>();
        Map<String, Integer> perArtist = new HashMap<>();
        Set<Integer> used = new HashSet<>();
        for (int idx : order) {
            String ak = MatchUtils.normalizeArtist(String.valueOf(ranked.get(idx).get("artist")));
            if (perArtist.getOrDefault(ak, 0) >= GENRE_MAX_PER_ARTIST) continue;
            perArtist.merge(ak, 1, Integer::sum);
            used.add(idx);
            result.add(ranked.get(idx));
            if (result.size() >= GENRE_RESULT_LIMIT) break;
        }
        // 후보가 모자라면 아티스트당 한도를 +1만 풀어서 채운다. (그래도 모자라면 15곡 미만으로 반환)
        for (int idx : order) {
            if (result.size() >= GENRE_RESULT_LIMIT) break;
            if (used.contains(idx)) continue;
            String ak = MatchUtils.normalizeArtist(String.valueOf(ranked.get(idx).get("artist")));
            if (perArtist.getOrDefault(ak, 0) >= GENRE_MAX_PER_ARTIST + 1) continue;
            perArtist.merge(ak, 1, Integer::sum);
            used.add(idx);
            result.add(ranked.get(idx));
        }
        System.out.println("[LastFM] 장르 지정 추천 " + genres + " · 후보 " + pool.size()
                + "곡 → 선택 " + result.size() + "곡 (감정 키워드 " + emotionKeys + ")");
        System.out.println("[LastFM] 아티스트 분포 " + perArtist);
        Collections.shuffle(result, rnd); // 점수 상위권 안에서 표시 순서만 섞기
        return result;
    }

    /** 태그 하나의 인기곡 한 페이지 (name/artist/image). 실패하면 빈 리스트. */
    private List<Map<String, String>> fetchTagTracks(String tag, int page, int limit) {
        List<Map<String, String>> out = new ArrayList<>();
        try {
            String url = "http://ws.audioscrobbler.com/2.0/"
                    + "?method=tag.gettoptracks"
                    + "&tag=" + java.net.URLEncoder.encode(tag, "UTF-8")
                    + "&api_key=" + lastfmApiKey
                    + "&format=json&limit=" + limit + "&page=" + page;
            ResponseEntity<Map> res = restTemplate.getForEntity(java.net.URI.create(url), Map.class);
            Map<String, Object> body = res.getBody();
            if (body == null) return out;
            Map<String, Object> tracks = (Map<String, Object>) body.get("tracks");
            if (tracks == null) return out;
            List<Map<String, Object>> list = (List<Map<String, Object>>) tracks.get("track");
            if (list == null) return out;
            for (Map<String, Object> t : list) {
                String name = (String) t.get("name");
                if (name == null || name.isBlank()) continue;
                Map<String, Object> artist = (Map<String, Object>) t.get("artist");
                Map<String, String> track = new HashMap<>();
                track.put("name", name);
                track.put("artist", artist != null ? (String) artist.get("name") : "Unknown");
                List<Map<String, Object>> images = (List<Map<String, Object>>) t.get("image");
                if (images != null) {
                    for (Map<String, Object> img : images) {
                        String src = (String) img.get("#text");
                        if (("large".equals(img.get("size")) || "extralarge".equals(img.get("size")))
                                && src != null && !src.isBlank()) track.put("image", src);
                    }
                }
                out.add(track);
            }
        } catch (Exception e) {
            System.err.println("[LastFM] 장르 곡 조회 오류 [" + tag + " p" + page + "]: " + e.getMessage());
        }
        return out;
    }

    /** 곡 점수 = 감정 키워드와 겹치는 상위 태그 수 + (곡의 상위 10개 태그에 장르 키워드가 있으면 보너스).
     *  보너스 덕분에 태그가 엉뚱하게 붙은 곡(예: 발라드 태그만 우연히 달린 해외곡)보다
     *  실제로 그 장르로 분류되는 곡이 먼저 뽑힌다. 조회 실패 시 0점. */
    private int trackScore(String name, String artist, Set<String> emotionKeys, Set<String> genreTerms) {
        try {
            String url = "http://ws.audioscrobbler.com/2.0/"
                    + "?method=track.gettoptags"
                    + "&artist=" + java.net.URLEncoder.encode(artist, "UTF-8")
                    + "&track=" + java.net.URLEncoder.encode(name, "UTF-8")
                    + "&autocorrect=1&api_key=" + lastfmApiKey + "&format=json";
            ResponseEntity<Map> res = restTemplate.getForEntity(java.net.URI.create(url), Map.class);
            Map<String, Object> body = res.getBody();
            if (body == null) return 0;
            Map<String, Object> toptags = (Map<String, Object>) body.get("toptags");
            if (toptags == null) return 0;
            List<Map<String, Object>> tags = (List<Map<String, Object>>) toptags.get("tag");
            if (tags == null) return 0;
            int score = 0;
            boolean genreHit = false;
            int rank = 0;
            for (Map<String, Object> t : tags) {
                String tagName = String.valueOf(t.get("name")).toLowerCase();
                for (String key : emotionKeys) {
                    if (tagName.equals(key) || tagName.contains(key)) { score++; break; }
                }
                if (rank < 10) {
                    for (String term : genreTerms) {
                        if (tagName.equals(term) || tagName.contains(term)) { genreHit = true; break; }
                    }
                }
                rank++;
            }
            return score + (genreHit ? GENRE_TAG_MATCH_BONUS : 0);
        } catch (Exception e) {
            return 0;
        }
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
