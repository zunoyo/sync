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
