package com.graduate.Sync.api;

import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.PlaylistService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.LinkedHashSet;

@RestController
@RequestMapping("/api/home")
public class
HomeApiController {

    @Autowired private PlaylistService playlistService;
    @Autowired private RestTemplate    restTemplate;

    @Value("${lastfm.api.key:}") private String lastfmApiKey;

    /** iTunes/Apple RSS 아트 URL의 해상도 토큰을 600x600bb로 업스케일 */
    private static String hiResArt(Object raw) {
        if (raw == null) return null;
        return raw.toString().replaceAll("\\d+x\\d+bb", "600x600bb");
    }

    /* ── 결과 캐시 (30분) ── */
    private static volatile List<Map<String, Object>> _chartCache;
    private static volatile long _chartCacheAt = 0;
    private static final long CACHE_MS = 30 * 60 * 1000L;

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

    /* ══ 5. 나라별 TOP 차트
       GET /api/home/top-charts?country=KR
       KR: Apple RSS 공식 피드 (실제 한국 차트)
       US/JP/GB/FR: Last.fm geo.getTopTracks
       폴백: Last.fm global chart
    ════════════════════════════════════════════════════════ */
    private static final Map<String, String> COUNTRY_NAMES = Map.of(
        "US", "united states", "JP", "japan",
        "GB", "united kingdom", "FR", "france"
    );

    @GetMapping("/top-charts")
    public ResponseEntity<List<Map<String, Object>>> getTopCharts(
            @RequestParam(defaultValue = "KR") String country) {

        List<Map<String, Object>> result = new ArrayList<>();
        String countryUpper = country.toUpperCase();

        try {
            if ("KR".equals(countryUpper)) {
                // Apple 공식 RSS 마케팅 피드 — 한국 실차트
                String rssUrl = "https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/100/songs.json";
                ResponseEntity<String> rssRes = restTemplate.getForEntity(rssUrl, String.class);
                if (rssRes.getBody() != null) {
                    com.fasterxml.jackson.databind.ObjectMapper mapper =
                            new com.fasterxml.jackson.databind.ObjectMapper();
                    Map<String, Object> rssBody = mapper.readValue(rssRes.getBody(), Map.class);
                    Map<String, Object> feed = (Map<String, Object>) rssBody.get("feed");
                    if (feed != null) {
                        List<Map<String, Object>> items = (List<Map<String, Object>>) feed.get("results");
                        if (items != null) {
                            for (int i = 0; i < Math.min(items.size(), 20); i++) {
                                Map<String, Object> it = items.get(i);
                                Map<String, Object> track = new HashMap<>();
                                track.put("rank",     i + 1);
                                track.put("name",     it.get("name"));
                                track.put("artist",   it.get("artistName"));
                                track.put("albumArt", hiResArt(it.get("artworkUrl100")));
                                result.add(track);
                            }
                        }
                    }
                }
            } else if (lastfmApiKey != null && !lastfmApiKey.isBlank()) {
                String countryName = COUNTRY_NAMES.get(countryUpper);
                if (countryName != null) {
                    // Last.fm geo.gettoptracks for US/JP/GB/FR
                    String url = "http://ws.audioscrobbler.com/2.0/"
                            + "?method=geo.gettoptracks"
                            + "&country=" + java.net.URLEncoder.encode(countryName, "UTF-8")
                            + "&api_key=" + lastfmApiKey
                            + "&format=json&limit=20";
                    ResponseEntity<Map> res = restTemplate.getForEntity(url, Map.class);
                    Map<String, Object> body = res.getBody();
                    if (body != null && !body.containsKey("error")) {
                        Map<String, Object> tracksMap = (Map<String, Object>) body.get("tracks");
                        if (tracksMap != null) {
                            List<Map<String, Object>> list = (List<Map<String, Object>>) tracksMap.get("track");
                            if (list != null) {
                                for (int i = 0; i < list.size(); i++) {
                                    Map<String, Object> t = list.get(i);
                                    String name = (String) t.get("name");
                                    Object ao   = t.get("artist");
                                    String artist = (ao instanceof Map) ? (String)((Map<?,?>)ao).get("name") : "Unknown";
                                    Map<String, Object> track = new HashMap<>();
                                    track.put("rank",   i + 1);
                                    track.put("name",   name);
                                    track.put("artist", artist);
                                    result.add(track);
                                }
                            }
                        }
                    }
                }

                // 지원하지 않는 국가 → Last.fm global chart 폴백
                if (result.isEmpty()) {
                    String globalUrl = "http://ws.audioscrobbler.com/2.0/"
                            + "?method=chart.gettoptracks"
                            + "&api_key=" + lastfmApiKey
                            + "&format=json&limit=20";
                    ResponseEntity<Map> gRes = restTemplate.getForEntity(globalUrl, Map.class);
                    Map<String, Object> gBody = gRes.getBody();
                    if (gBody != null) {
                        Map<String, Object> tracksMap = (Map<String, Object>) gBody.get("tracks");
                        if (tracksMap != null) {
                            List<Map<String, Object>> list = (List<Map<String, Object>>) tracksMap.get("track");
                            if (list != null) {
                                for (int i = 0; i < list.size(); i++) {
                                    Map<String, Object> t = list.get(i);
                                    String name = (String) t.get("name");
                                    Object ao   = t.get("artist");
                                    String artist = (ao instanceof Map) ? (String)((Map<?,?>)ao).get("name") : "Unknown";
                                    Map<String, Object> track = new HashMap<>();
                                    track.put("rank",   i + 1);
                                    track.put("name",   name);
                                    track.put("artist", artist);
                                    result.add(track);
                                }
                            }
                        }
                    }
                }
            }
            System.out.println("[HomeAPI] top-charts " + country + " 로드 (" + result.size() + "곡)");
        } catch (Exception e) {
            System.err.println("[HomeAPI] top-charts 실패: " + e.getMessage());
        }
        return ResponseEntity.ok(result);
    }

    /* ══ 6. 아티스트 추천 (Last.fm artist.getSimilar + getTopTracks) ══
       GET /api/home/artist-recommend?seedArtist=아이유
    ════════════════════════════════════════════════════════ */
    @GetMapping("/artist-recommend")
    public ResponseEntity<List<Map<String, Object>>> getArtistRecommend(
            @RequestParam(defaultValue = "") String seedArtist) {

        List<Map<String, Object>> result = new ArrayList<>();
        if (seedArtist.isBlank() || lastfmApiKey == null || lastfmApiKey.isBlank())
            return ResponseEntity.ok(result);

        try {
            // 유사 아티스트 5명
            String simUrl = "http://ws.audioscrobbler.com/2.0/"
                    + "?method=artist.getsimilar"
                    + "&artist=" + java.net.URLEncoder.encode(seedArtist, "UTF-8")
                    + "&api_key=" + lastfmApiKey
                    + "&format=json&limit=5";

            ResponseEntity<Map> simRes = restTemplate.getForEntity(simUrl, Map.class);
            Map<String, Object> simBody = simRes.getBody();

            List<String> artists = new ArrayList<>();
            artists.add(seedArtist);
            if (simBody != null) {
                Map<String, Object> simArtists = (Map<String, Object>) simBody.get("similarartists");
                if (simArtists != null) {
                    List<Map<String, Object>> simList = (List<Map<String, Object>>) simArtists.get("artist");
                    if (simList != null) {
                        for (Map<String, Object> a : simList) {
                            String aName = (String) a.get("name");
                            if (aName != null) artists.add(aName);
                        }
                    }
                }
            }

            // 각 아티스트 top 3 트랙
            for (String artistName : artists) {
                String topUrl = "http://ws.audioscrobbler.com/2.0/"
                        + "?method=artist.gettoptracks"
                        + "&artist=" + java.net.URLEncoder.encode(artistName, "UTF-8")
                        + "&api_key=" + lastfmApiKey
                        + "&format=json&limit=3";

                try {
                    ResponseEntity<Map> topRes = restTemplate.getForEntity(topUrl, Map.class);
                    Map<String, Object> topBody = topRes.getBody();
                    if (topBody == null) continue;
                    Map<String, Object> tMap = (Map<String, Object>) topBody.get("toptracks");
                    if (tMap == null) continue;
                    List<Map<String, Object>> tList = (List<Map<String, Object>>) tMap.get("track");
                    if (tList == null) continue;
                    for (Map<String, Object> t : tList) {
                        Map<String, Object> item = new HashMap<>();
                        item.put("name",   t.get("name"));
                        item.put("artist", artistName);
                        result.add(item);
                    }
                } catch (Exception ignored) {}
            }
            System.out.println("[HomeAPI] artist-recommend " + seedArtist + " → " + result.size() + "곡");
        } catch (Exception e) {
            System.err.println("[HomeAPI] artist-recommend 실패: " + e.getMessage());
        }
        return ResponseEntity.ok(result);
    }

    private static final Map<String, String> GENRE_TERMS = Map.of(
        "kpop",       "k-pop",
        "rnb soul",   "r&b soul",
        "lofi chill", "lofi",
        "pop ballad", "ballad",
        "indie rock",  "indie rock",
        "hip hop",    "hip hop",
        "jazz",       "jazz"
    );

    /* ══ 7. 장르별 추천 (iTunes Search API) ════════════════
       GET /api/home/genre-chart?genre=kpop
       iTunes US 카탈로그 사용 (KR은 검색결과 없음)
    ════════════════════════════════════════════════════════ */
    @GetMapping("/genre-chart")
    public ResponseEntity<List<Map<String, Object>>> getGenreChart(
            @RequestParam(defaultValue = "kpop") String genre,
            @RequestParam(defaultValue = "us")   String country) {

        List<Map<String, Object>> result = new ArrayList<>();
        try {
            String searchTerm = GENRE_TERMS.getOrDefault(genre.toLowerCase(), genre);
            String url = "https://itunes.apple.com/search"
                    + "?term=" + java.net.URLEncoder.encode(searchTerm, "UTF-8")
                    + "&media=music&entity=song"
                    + "&country=us"
                    + "&limit=50&lang=ko_kr";

            ResponseEntity<String> res = restTemplate.getForEntity(url, String.class);
            if (res.getBody() == null) return ResponseEntity.ok(result);

            com.fasterxml.jackson.databind.ObjectMapper mapper =
                    new com.fasterxml.jackson.databind.ObjectMapper();
            Map<String, Object> body = mapper.readValue(res.getBody(), Map.class);

            List<Map<String, Object>> results = (List<Map<String, Object>>) body.get("results");
            if (results == null) return ResponseEntity.ok(result);

            // collectionId 기준 앨범 중복 제거 — 같은 앨범의 두 번째 곡부터 스킵
            Set<Object> seenAlbums = new LinkedHashSet<>();
            for (Map<String, Object> r : results) {
                if (result.size() >= 20) break;
                Object colId = r.get("collectionId");
                if (colId != null && !seenAlbums.add(colId)) continue;
                Map<String, Object> item = new HashMap<>();
                item.put("name",       r.get("trackName"));
                item.put("artist",     r.get("artistName"));
                item.put("albumArt",   hiResArt(r.get("artworkUrl100")));
                item.put("previewUrl", r.get("previewUrl"));
                item.put("durationMs", r.get("trackTimeMillis"));
                result.add(item);
            }
            System.out.println("[HomeAPI] genre-chart " + genre + "/" + country + " → " + result.size() + "곡");
        } catch (Exception e) {
            System.err.println("[HomeAPI] genre-chart 실패: " + e.getMessage());
        }
        return ResponseEntity.ok(result);
    }
}
