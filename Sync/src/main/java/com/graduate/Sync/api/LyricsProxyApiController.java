package com.graduate.Sync.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * 가사 조회 프록시.
 *
 * 브라우저가 https://lrclib.net 을 직접 호출하면 CORS 차단이나 520(Cloudflare) 오류로 자주 실패했다.
 * 서버 대 서버 요청은 CORS 대상이 아니므로 백엔드가 대신 조회해서 한 가지 형태로 돌려준다.
 *
 *   GET /api/lyrics?artist=아이유&title=밤편지
 *   → { "status": "ok" | "not-found" | "not-found-ko",
 *       "syncedLyrics": "[00:12.30] ...",   // 타임스탬프 가사(없으면 null)
 *       "plainLyrics":  "...",              // 일반 가사(없으면 null)
 *       "source": "lrclib" | "lyrics.ovh" }
 *
 * 조회 순서: ① lrclib /get(정확 일치) → ② lrclib /search(제목·아티스트) → ③ lrclib /search(괄호·feat. 제거한 제목)
 *            → ④ lyrics.ovh(일반 가사 폴백)
 * 응답은 항상 200 으로 돌려 프런트 콘솔에 404 가 쌓이지 않게 한다.
 * 같은 곡은 캐시한다(성공 24시간 / 실패 5분 — 일시적 오류가 오래 남지 않도록 짧게).
 * 이 경로는 LoginInterceptor 대상이 아니라 로그인 없이도 호출된다(WebConfig 참고).
 */
@RestController
@RequestMapping("/api/lyrics")
public class LyricsProxyApiController {

    @Autowired private ObjectMapper objectMapper;

    private static final String UA = "SyncApp/1.0 (graduation project; server)";
    private static final long OK_CACHE_MS   = 24L * 60 * 60 * 1000;
    private static final long MISS_CACHE_MS = 5L * 60 * 1000;
    private static final Pattern HANGUL = Pattern.compile("[\\uAC00-\\uD7A3]");
    // "(feat. xxx)", "[Remastered]", " - Live" 같은 꼬리표
    private static final Pattern DECORATION = Pattern.compile("\\s*[\\(\\[][^\\)\\]]*[\\)\\]]|\\s+-\\s+.*$");

    // 외부 서비스가 느릴 때 요청 스레드가 오래 묶이지 않도록 별도 타임아웃을 둔 RestTemplate
    private final RestTemplate http = buildHttp();

    private static RestTemplate buildHttp() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(4000);
        f.setReadTimeout(6000);
        return new RestTemplate(f);
    }

    private static class Entry {
        final Map<String, Object> body;
        final long at = System.currentTimeMillis();
        final long ttl;
        Entry(Map<String, Object> body, long ttl) { this.body = body; this.ttl = ttl; }
        boolean fresh() { return System.currentTimeMillis() - at < ttl; }
    }
    private final Map<String, Entry> cache = new ConcurrentHashMap<>();

    @GetMapping
    public ResponseEntity<Map<String, Object>> lyrics(
            @RequestParam(defaultValue = "") String artist,
            @RequestParam String title,
            @RequestParam(required = false) Integer duration) {   // 곡 길이(초) — 같은 제목의 다른 버전/다른 곡 가사를 걸러내는 데 사용

        String a = artist.trim(), t = title.trim();
        if (t.isEmpty()) return ResponseEntity.ok(result("not-found", null, null, null));
        Integer dur = (duration != null && duration > 0) ? duration : null;

        String key = (a + "||" + t + "||" + (dur == null ? 0 : dur)).toLowerCase();
        Entry cached = cache.get(key);
        if (cached != null && cached.fresh()) return ResponseEntity.ok(cached.body);

        Map<String, Object> res = find(a, t, dur);
        boolean ok = "ok".equals(res.get("status"));
        cache.put(key, new Entry(res, ok ? OK_CACHE_MS : MISS_CACHE_MS));
        return ResponseEntity.ok(res);
    }

    private Map<String, Object> find(String artist, String title, Integer dur) {
        String cleanTitle = DECORATION.matcher(title).replaceAll("").trim();
        if (cleanTitle.isEmpty()) cleanTitle = title;
        // 한국어 곡이면 한글이 들어 있는 가사만 받는다. lrclib 에는 "annyeong" 같은 로마자 표기 가사가
        // 같은 곡으로 올라와 있는 경우가 있어, 걸러내지 않으면 한글 대신 발음 표기가 나온다.
        boolean ko = HANGUL.matcher(title).find();   // 제목이 한글인 곡만 엄격하게 (영어 제목 곡의 영어 가사는 그대로 허용)

        // ① 정확 일치 (길이를 알면 길이까지 맞는 버전)
        Map<String, Object> hit = fromLrclibGet(artist, title, dur, ko);
        if (hit == null && !cleanTitle.equals(title)) hit = fromLrclibGet(artist, cleanTitle, dur, ko);
        // ② 검색 (표기 차이 허용) — 길이가 가장 가까운 후보 우선
        if (hit == null) hit = fromLrclibSearch("track_name", title, "artist_name", artist, artist, dur, false, ko);
        // ③ 꼬리표 제거한 제목으로 검색
        if (hit == null && !cleanTitle.equals(title)) hit = fromLrclibSearch("track_name", cleanTitle, "artist_name", artist, artist, dur, false, ko);
        // ④ 자유 검색 — 엉뚱한 곡이 걸리기 쉬워 아티스트 일치를 추가로 확인
        if (hit == null) hit = fromLrclibSearch("q", (artist + " " + cleanTitle).trim(), null, null, artist, dur, true, ko);
        if (hit != null) return hit;

        // ⑤ lyrics.ovh — 일반 가사만 있고 한국어 곡에는 거의 없음
        boolean koreanTrack = HANGUL.matcher(title + artist).find();
        Map<String, Object> ovh = fromOvh(artist, cleanTitle);
        if (ovh != null) {
            String plain = (String) ovh.get("plainLyrics");
            if (koreanTrack && !HANGUL.matcher(plain).find()) return result("not-found-ko", null, null, null);
            return ovh;
        }
        return result(koreanTrack ? "not-found-ko" : "not-found", null, null, null);
    }

    /* ── lrclib ── */
    private Map<String, Object> fromLrclibGet(String artist, String title, Integer dur, boolean ko) {
        UriComponentsBuilder b = UriComponentsBuilder.fromUriString("https://lrclib.net/api/get")
                .queryParam("artist_name", artist)
                .queryParam("track_name", title);
        if (dur != null) b.queryParam("duration", dur);   // lrclib 는 ±2초 이내 버전만 돌려준다
        JsonNode n = getJson(b.build().encode().toUri());
        if (n == null) return null;
        // 길이를 안 보냈거나 응답 길이가 크게 다르면 다른 버전일 수 있어 건너뛰고 검색으로 넘어간다
        if (!durationClose(n, dur, 6)) return null;
        return pick(n, dur, ko);
    }

    private Map<String, Object> fromLrclibSearch(String k1, String v1, String k2, String v2,
                                                 String artist, Integer dur, boolean checkArtist, boolean ko) {
        UriComponentsBuilder b = UriComponentsBuilder.fromUriString("https://lrclib.net/api/search").queryParam(k1, v1);
        if (k2 != null && v2 != null && !v2.isEmpty()) b.queryParam(k2, v2);
        JsonNode arr = getJson(b.build().encode().toUri());
        if (arr == null || !arr.isArray()) return null;

        Map<String, Object> best = null;
        double bestScore = -1;
        for (JsonNode n : arr) {
            Map<String, Object> m = pick(n, dur, ko);
            if (m == null) continue;
            if (!durationClose(n, dur, 6)) continue;                       // 길이가 많이 다르면 다른 곡/버전
            boolean durOk = durationClose(n, dur, 3) && dur != null && n.hasNonNull("duration");
            if (checkArtist && !artist.isEmpty() && !durOk && !artistLoose(artist, text(n, "artistName"))) continue;
            double score = (m.get("syncedLyrics") != null ? 10 : 0) + (durOk ? 5 : 0);
            if (dur != null && n.hasNonNull("duration")) score -= Math.abs(n.get("duration").asDouble() - dur) * 0.1;
            if (score > bestScore) { best = m; bestScore = score; }
        }
        return best;
    }

    /** 길이를 모르거나 응답에 길이가 없으면 통과, 알면 허용 오차(초) 이내인지 */
    private static boolean durationClose(JsonNode n, Integer dur, double tolSec) {
        if (dur == null || n == null || !n.hasNonNull("duration")) return true;
        return Math.abs(n.get("duration").asDouble() - dur) <= tolSec;
    }

    private static boolean artistLoose(String a, String b) {
        if (b == null) return false;
        String x = a.toLowerCase().replaceAll("[^\\p{L}\\p{N}]", "");
        String y = b.toLowerCase().replaceAll("[^\\p{L}\\p{N}]", "");
        if (x.isEmpty() || y.isEmpty()) return false;
        return x.equals(y) || (Math.min(x.length(), y.length()) >= 2 && (x.contains(y) || y.contains(x)));
    }

    /** 타임스탬프 가사는 녹음 버전이 같아야만 맞는다. 곡 길이가 3초 넘게 다르면 다른 버전이므로
     *  싱크 가사는 버리고 일반 가사만 돌려준다(줄이 통째로 밀려 보이는 것보다 낫다). */
    private Map<String, Object> pick(JsonNode n, Integer dur, boolean ko) {
        String synced = text(n, "syncedLyrics");
        String plain  = text(n, "plainLyrics");
        if (ko && !hasHangul(synced) && !hasHangul(plain)) return null;   // 로마자 표기 버전 제외
        if (synced != null && !durationClose(n, dur, 3)) {
            synced = null;
            if (plain == null) plain = stripTimestamps(text(n, "syncedLyrics"));
        }
        if (synced == null && plain == null) return null;
        return result("ok", synced, plain, "lrclib");
    }

    private static boolean hasHangul(String t) {
        if (t == null) return false;
        int c = 0;
        java.util.regex.Matcher m = HANGUL.matcher(t);
        while (m.find() && ++c >= 3) return true;
        return false;
    }

    private static String stripTimestamps(String lrc) {
        if (lrc == null) return null;
        String r = lrc.replaceAll("(?m)^\\s*\\[\\d{2}:\\d{2}(?:\\.\\d{1,3})?\\]\\s*", "").trim();
        return r.isEmpty() ? null : r;
    }

    /* ── lyrics.ovh ── */
    private Map<String, Object> fromOvh(String artist, String title) {
        if (artist.isEmpty()) return null;
        URI uri = UriComponentsBuilder.fromUriString("https://api.lyrics.ovh/v1")
                .pathSegment(artist, title)
                .build().encode().toUri();
        JsonNode n = getJson(uri);
        String lyrics = n == null ? null : text(n, "lyrics");
        return lyrics == null ? null : result("ok", null, lyrics, "lyrics.ovh");
    }

    /* ── 공통 ── */
    private JsonNode getJson(URI uri) {
        try {
            HttpHeaders h = new HttpHeaders();
            h.set("User-Agent", UA);
            ResponseEntity<String> r = http.exchange(uri, HttpMethod.GET, new HttpEntity<Void>(h), String.class);
            if (!r.getStatusCode().is2xxSuccessful() || r.getBody() == null) return null;
            return objectMapper.readTree(r.getBody());
        } catch (Exception e) {
            // 404(없는 곡) 포함 — 다음 단계로 넘어간다
            return null;
        }
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull()) return null;
        String s = v.asText();
        return s == null || s.trim().isEmpty() ? null : s;
    }

    private static Map<String, Object> result(String status, String synced, String plain, String source) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", status);
        m.put("syncedLyrics", synced);
        m.put("plainLyrics", plain);
        m.put("source", source);
        return m;
    }
}
