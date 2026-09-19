package com.graduate.Sync.api;

import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.PlaylistService;
import com.graduate.Sync.util.ArtUtils;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@RestController
@RequestMapping("/api/home")
public class HomeApiController {

    @Autowired private PlaylistService playlistService;
    @Autowired private RestTemplate    restTemplate;

    @Value("${lastfm.api.key:}") private String lastfmApiKey;

    /* ── 결과 캐시 (30분) ── */
    private static volatile List<Map<String, Object>> _chartCache;
    private static volatile long _chartCacheAt = 0;
    private static final long CACHE_MS = 30 * 60 * 1000L;

    /* ── 파라미터별 캐시(국가별 차트/아티스트, 장르별 추천) ── */
    private static class CacheEntry {
        final List<Map<String, Object>> data;
        final long at;
        CacheEntry(List<Map<String, Object>> data) { this.data = data; this.at = System.currentTimeMillis(); }
        boolean fresh() { return System.currentTimeMillis() - at < CACHE_MS; }
    }
    private final Map<String, CacheEntry> _countryChartCache   = new java.util.concurrent.ConcurrentHashMap<>();
    private final Map<String, CacheEntry> _trendingArtistCache = new java.util.concurrent.ConcurrentHashMap<>();
    private final Map<String, CacheEntry> _genreTrackCache     = new java.util.concurrent.ConcurrentHashMap<>();

    /* 나라별 TOP 차트 탭에서 선택 가능한 국가 목록 (Last.fm geo API가 쓰는 영문 국가명 기준) */
    private static final List<Map<String, String>> COUNTRIES = List.of(
            Map.of("code", "south korea",    "label", "🇰🇷 대한민국"),
            Map.of("code", "united states",  "label", "🇺🇸 미국"),
            Map.of("code", "japan",          "label", "🇯🇵 일본"),
            Map.of("code", "united kingdom", "label", "🇬🇧 영국"),
            Map.of("code", "france",         "label", "🇫🇷 프랑스")
    );

    /* 장르별 추천 칩에서 선택 가능한 장르 목록 (Last.fm 태그 기준) */
    private static final List<Map<String, String>> GENRE_TAGS = List.of(
            Map.of("tag", "k-pop",   "label", "K-Pop",  "emoji", "🎤"),
            Map.of("tag", "indie",   "label", "인디",    "emoji", "🎸"),
            Map.of("tag", "hip hop", "label", "힙합",    "emoji", "🎧"),
            Map.of("tag", "lo-fi",   "label", "Lo-Fi",  "emoji", "🌙"),
            Map.of("tag", "rnb",     "label", "R&B",    "emoji", "💜"),
            Map.of("tag", "pop",     "label", "팝",      "emoji", "⭐")
    );

    /** Last.fm 트랙 목록 응답(JSON)에서 공통으로 name/artist만 뽑아내는 헬퍼 */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseLastfmTracks(Map<String, Object> body) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (body == null) return result;
        Map<String, Object> tracksMap = (Map<String, Object>) body.get("tracks");
        if (tracksMap == null) return result;
        List<Map<String, Object>> list = (List<Map<String, Object>>) tracksMap.get("track");
        if (list == null) return result;
        for (int i = 0; i < list.size(); i++) {
            Map<String, Object> t = list.get(i);
            String name = (String) t.get("name");
            Object ao = t.get("artist");
            String artist = (ao instanceof Map) ? (String) ((Map<?, ?>) ao).get("name") : "Unknown";
            Map<String, Object> track = new HashMap<>();
            track.put("rank", i + 1);
            track.put("name", name);
            track.put("artist", artist);
            result.add(track);
        }
        return result;
    }

    /* ══ 5. 나라별 TOP 차트 — 국가 목록 ══════════════════ */
    @GetMapping("/countries")
    public ResponseEntity<List<Map<String, String>>> getCountries() {
        return ResponseEntity.ok(COUNTRIES);
    }

    /* ══ 6. 나라별 TOP 차트 — 선택한 국가의 트랙 ═══════════
       하이브리드 소스: 한국(south korea)은 Last.fm geo.gettoptracks가 결과가
       비거나 불안정할 때가 있어, Apple 공식 마케팅 RSS 피드(API 키 불필요,
       앨범아트까지 포함)로 소스를 교체. 그 외 국가는 기존 Last.fm geo API 그대로.
       국가별 30분 캐시.
    ════════════════════════════════════════════════════ */
    @GetMapping("/charts/country")
    public ResponseEntity<List<Map<String, Object>>> getCountryChart(
            @RequestParam(defaultValue = "south korea") String country) {

        CacheEntry cached = _countryChartCache.get(country);
        if (cached != null && cached.fresh()) return ResponseEntity.ok(cached.data);

        List<Map<String, Object>> result = "south korea".equalsIgnoreCase(country)
                ? fetchAppleTopSongsKR()
                : fetchLastfmCountryChart(country);

        // Apple RSS가 (드물지 않게) 502/504로 죽어있을 때는 한국도 Last.fm으로 폴백 —
        // 완전히 빈 화면보다는 약간 신뢰도가 낮아도 있는 게 낫다.
        if (result.isEmpty() && "south korea".equalsIgnoreCase(country)) {
            result = fetchLastfmCountryChart(country);
        }

        if (!result.isEmpty()) _countryChartCache.put(country, new CacheEntry(result));
        return ResponseEntity.ok(result);
    }

    /** 한국 차트 전용 — Apple 공식 마케팅 RSS 피드. API 키가 필요 없고, 앨범아트까지 같이
     *  내려주므로 프런트엔드의 iTunes 보강 단계를 건너뛸 수 있다. 도메인은
     *  rss.marketingtools.apple.com이 맞다(marketingtools가 apple.com의 서브도메인) —
     *  얼핏 비슷해 보이는 rss.applemarketingtools.com은 애플 소유가 아닌 다른 도메인이라
     *  502/504로 죽어있었다. 그래도 이 피드 자체가 가끔 불안정할 때가 있어서, 실패하면
     *  호출부(getCountryChart)에서 Last.fm으로 자동 폴백한다. */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchAppleTopSongsKR() {
        List<Map<String, Object>> result = new ArrayList<>();
        try {
            String url = "https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/25/songs.json";
            ResponseEntity<Map> res = restTemplate.getForEntity(url, Map.class);
            Map<String, Object> body = res.getBody();
            if (body == null) return result;
            Map<String, Object> feed = (Map<String, Object>) body.get("feed");
            if (feed == null) return result;
            List<Map<String, Object>> entries = (List<Map<String, Object>>) feed.get("results");
            if (entries == null) return result;

            int rank = 1;
            for (Map<String, Object> e : entries) {
                if (rank > 10) break;
                String name = (String) e.get("name");
                String artist = (String) e.get("artistName");
                if (name == null || artist == null) continue;
                String art = (String) e.get("artworkUrl100");
                Object artistId = e.get("artistId");
                Map<String, Object> track = new HashMap<>();
                track.put("rank", rank);
                track.put("name", name);
                track.put("artist", artist);
                if (art != null) track.put("albumArt", ArtUtils.hiResArt(art, 500));
                if (artistId != null) track.put("artistId", String.valueOf(artistId));
                result.add(track);
                rank++;
            }
        } catch (Exception ex) {
            System.err.println("[HomeAPI] Apple RSS 한국 차트 실패: " + ex.getMessage());
        }
        return result;
    }

    /** 한국 외 국가 — 기존 Last.fm geo.gettoptracks 경로 */
    private List<Map<String, Object>> fetchLastfmCountryChart(String country) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (lastfmApiKey == null || lastfmApiKey.isBlank()) return result;
        try {
            String url = "http://ws.audioscrobbler.com/2.0/"
                    + "?method=geo.gettoptracks"
                    + "&country=" + java.net.URLEncoder.encode(country, "UTF-8")
                    + "&api_key=" + lastfmApiKey
                    + "&format=json&limit=10";

            ResponseEntity<Map> res = restTemplate.getForEntity(url, Map.class);
            result = parseLastfmTracks(res.getBody());
        } catch (Exception e) {
            System.err.println("[HomeAPI] 국가별 차트 실패(" + country + "): " + e.getMessage());
        }
        return result;
    }

    /* ══ 7. 지금 인기있는 아티스트 — 선택한 국가 기준 ══════
       Last.fm geo.gettopartists는 실제로 호출해보니 geo.gettoptracks(나라별 차트)보다
       훨씬 자주 결과가 비거나 불안정해서(자체 검증 결과) 별도 호출 대신, 이미 안정적으로
       동작하는 나라별 차트(getCountryChart와 동일한 소스)에서 아티스트만 중복 없이
       추려서 사용한다 — 기존 "인기 아티스트"(전 세계 차트)와는 다른 국가별 신호라
       별도 섹션으로 의미는 그대로 유지된다.
    ════════════════════════════════════════════════════ */
    @GetMapping("/artists/trending")
    public ResponseEntity<List<Map<String, Object>>> getTrendingArtists(
            @RequestParam(defaultValue = "south korea") String country) {

        CacheEntry cached = _trendingArtistCache.get(country);
        if (cached != null && cached.fresh()) return ResponseEntity.ok(cached.data);

        List<Map<String, Object>> chart = "south korea".equalsIgnoreCase(country)
                ? fetchAppleTopSongsKR()
                : fetchLastfmCountryChart(country);
        if (chart.isEmpty() && "south korea".equalsIgnoreCase(country)) {
            chart = fetchLastfmCountryChart(country);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        java.util.LinkedHashSet<String> seen = new java.util.LinkedHashSet<>();
        for (Map<String, Object> t : chart) {
            String artist = (String) t.get("artist");
            if (artist == null || !seen.add(artist)) continue;
            Map<String, Object> item = new HashMap<>();
            item.put("name", artist);
            // Apple RSS(한국)는 트랙마다 artistId를 같이 주므로 넘겨준다 — 프런트에서
            // 이 ID로 바로 조회하면 이름만으로 하는 퍼지 검색보다 훨씬 정확하다.
            // Last.fm 소스(그 외 국가)는 이 필드가 없어서 자연히 이름 기반 검색으로 남는다.
            Object artistId = t.get("artistId");
            if (artistId != null) item.put("externalId", artistId);
            result.add(item);
            if (result.size() >= 6) break;
        }

        if (!result.isEmpty()) _trendingArtistCache.put(country, new CacheEntry(result));
        return ResponseEntity.ok(result);
    }

    /* ══ 8. 장르별 추천 — 장르 목록 ══════════════════════ */
    @GetMapping("/genres")
    public ResponseEntity<List<Map<String, String>>> getGenreTags() {
        return ResponseEntity.ok(GENRE_TAGS);
    }

    /* ══ 9. 장르별 추천 — 선택한 장르의 트랙 ═════════════
       Last.fm tag.gettoptracks — 장르별 30분 캐시
    ════════════════════════════════════════════════════ */
    @GetMapping("/genre-tracks")
    public ResponseEntity<List<Map<String, Object>>> getGenreTracks(
            @RequestParam(defaultValue = "k-pop") String genre) {

        CacheEntry cached = _genreTrackCache.get(genre);
        if (cached != null && cached.fresh()) return ResponseEntity.ok(cached.data);

        List<Map<String, Object>> result = new ArrayList<>();
        if (lastfmApiKey == null || lastfmApiKey.isBlank()) return ResponseEntity.ok(result);

        try {
            String url = "http://ws.audioscrobbler.com/2.0/"
                    + "?method=tag.gettoptracks"
                    + "&tag=" + java.net.URLEncoder.encode(genre, "UTF-8")
                    + "&api_key=" + lastfmApiKey
                    + "&format=json&limit=10";

            ResponseEntity<Map> res = restTemplate.getForEntity(url, Map.class);
            result = parseLastfmTracks(res.getBody());
            _genreTrackCache.put(genre, new CacheEntry(result));
        } catch (Exception e) {
            System.err.println("[HomeAPI] 장르별 추천 실패(" + genre + "): " + e.getMessage());
        }
        return ResponseEntity.ok(result);
    }

    /* ══ 1. 인기 차트 TOP 10 ════════════════════════════════
       Last.fm 에서 이름/아티스트만 반환
       앨범아트 + 미리듣기 URL 은 home.js 가 iTunes 로 직접 처리
    ════════════════════════════════════════════════════════ */
    @GetMapping("/charts")
    public ResponseEntity<List<Map<String, Object>>> getCharts() {

        // 30분 캐시 유효하면 즉시 반환
        if (_chartCache != null && !_chartCache.isEmpty()
                && System.currentTimeMillis() - _chartCacheAt < CACHE_MS) {
            return ResponseEntity.ok(_chartCache);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        if (lastfmApiKey == null || lastfmApiKey.isBlank())
            return ResponseEntity.ok(result);

        try {
            String url = "http://ws.audioscrobbler.com/2.0/"
                    + "?method=chart.gettoptracks"
                    + "&api_key=" + lastfmApiKey
                    + "&format=json&limit=10";

            ResponseEntity<Map> res = restTemplate.getForEntity(url, Map.class);
            Map<String, Object> body = res.getBody();
            if (body == null) return ResponseEntity.ok(result);

            Map<String, Object> tracksMap = (Map<String, Object>) body.get("tracks");
            if (tracksMap == null) return ResponseEntity.ok(result);

            List<Map<String, Object>> list =
                    (List<Map<String, Object>>) tracksMap.get("track");
            if (list == null) return ResponseEntity.ok(result);

            for (int i = 0; i < list.size(); i++) {
                Map<String, Object> t   = list.get(i);
                String name             = (String) t.get("name");
                Object ao               = t.get("artist");
                String artist           = (ao instanceof Map)
                        ? (String)((Map<?,?>)ao).get("name") : "Unknown";

                Map<String, Object> track = new HashMap<>();
                track.put("rank",      i + 1);
                track.put("name",      name);
                track.put("artist",    artist);
                // albumArt / previewUrl / durationMs 는 home.js 가 iTunes 로 채움
                result.add(track);
            }

            _chartCache   = result;
            _chartCacheAt = System.currentTimeMillis();
            System.out.println("[HomeAPI] 차트 로드 완료 (" + result.size() + "곡)");

        } catch (Exception e) {
            System.err.println("[HomeAPI] Last.fm 차트 실패: " + e.getMessage());
        }

        return ResponseEntity.ok(result);
    }

    /* ══ 2. 오늘의 추천 ══════════════════════════════════════
       home.js 가 iTunes 로 직접 처리하므로 빈 배열 반환
       (home.js 의 loadNewReleases 는 이 엔드포인트를 호출하지 않음)
    ════════════════════════════════════════════════════════ */
    @GetMapping("/new-releases")
    public ResponseEntity<List<Map<String, Object>>> getNewReleases() {
        return ResponseEntity.ok(Collections.emptyList());
    }

    /* ══ 3. 인기 아티스트 TOP 6 ═══════════════════════════
       Last.fm chart.gettopartists — 30분 캐시
    ════════════════════════════════════════════════════ */
    private static volatile List<Map<String, Object>> _artistCache;
    private static volatile long _artistCacheAt = 0;

    @GetMapping("/artists")
    public ResponseEntity<List<Map<String, Object>>> getArtists() {
        if (_artistCache != null && !_artistCache.isEmpty()
                && System.currentTimeMillis() - _artistCacheAt < CACHE_MS) {
            return ResponseEntity.ok(_artistCache);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        if (lastfmApiKey == null || lastfmApiKey.isBlank())
            return ResponseEntity.ok(result);

        try {
            String url = "http://ws.audioscrobbler.com/2.0/"
                    + "?method=chart.gettopartists"
                    + "&api_key=" + lastfmApiKey
                    + "&format=json&limit=6";

            ResponseEntity<Map> res = restTemplate.getForEntity(url, Map.class);
            Map<String, Object> body = res.getBody();
            if (body == null) return ResponseEntity.ok(result);

            Map<String, Object> artists = (Map<String, Object>) body.get("artists");
            if (artists == null) return ResponseEntity.ok(result);

            List<Map<String, Object>> list =
                    (List<Map<String, Object>>) artists.get("artist");
            if (list == null) return ResponseEntity.ok(result);

            for (Map<String, Object> a : list) {
                Map<String, Object> item = new HashMap<>();
                item.put("name",      a.get("name"));
                item.put("listeners", a.get("listeners"));
                item.put("url",       a.get("url"));
                result.add(item);
            }

            _artistCache   = result;
            _artistCacheAt = System.currentTimeMillis();
        } catch (Exception e) {
            System.err.println("[HomeAPI] 아티스트 조회 실패: " + e.getMessage());
        }
        return ResponseEntity.ok(result);
    }

    /* ══ 4. 빠른 액세스 ═══════════════════════════════════ */
    @GetMapping("/quick-access")
    public ResponseEntity<List<Map<String, Object>>> getQuickAccess(HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        List<Map<String, Object>> result = new ArrayList<>();
        if (loginUser == null) return ResponseEntity.ok(result);
        for (PlaylistEntity pl : playlistService.index(loginUser)) {
            Map<String, Object> item = new HashMap<>();
            item.put("id",           pl.getId());
            item.put("playlistName", pl.getPlaylistName());
            item.put("source",       pl.getSource());
            item.put("emoji",        pl.getEmoji());
            item.put("gradient",     pl.getGradient());
            result.add(item);
        }
        return ResponseEntity.ok(result);
    }
}
