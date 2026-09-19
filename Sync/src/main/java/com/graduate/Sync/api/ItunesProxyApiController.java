package com.graduate.Sync.api;

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
import org.springframework.web.util.UriComponentsBuilder;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;

/**
 * iTunes Search API 프록시.
 *
 * 브라우저(바닐라 JS)에서 https://itunes.apple.com 을 직접 호출하면 Apple 쪽에서
 * 403으로 막는 일이 잦아졌다(레이트리밋/봇 차단으로 추정). 서버 대 서버 요청은
 * 이 문제를 겪지 않으므로, 백엔드가 대신 호출해서 그대로 돌려준다.
 * 쿼리 파라미터를 그대로 전달하므로 프런트엔드는 URL의 origin만
 * "https://itunes.apple.com" → "/api/itunes-proxy" 로 바꾸면 된다.
 *
 * 다만 이렇게 서버를 거치면 여러 사용자/여러 컴포넌트의 요청이 전부 서버 하나의
 * IP로 몰리기 때문에, 오히려 iTunes 쪽 레이트리밋(429)에 더 쉽게 걸린다 — 실제로
 * 로그에서 확인됨. 그래서 동일한 검색어는 짧은 시간 내 재요청 시 캐시로 응답해
 * 실제 외부 요청 수 자체를 줄인다.
 */
@RestController
@RequestMapping("/api/itunes-proxy")
public class ItunesProxyApiController {

    @Autowired private RestTemplate restTemplate;

    private static final long CACHE_MS = 6 * 60 * 60 * 1000L; // 6시간 — 검색 결과가 이 안에 바뀔 일은 거의 없음

    private static class CacheEntry {
        final String body;
        final int status;
        final long at;
        CacheEntry(String body, int status) { this.body = body; this.status = status; this.at = System.currentTimeMillis(); }
        boolean fresh() { return System.currentTimeMillis() - at < CACHE_MS; }
    }
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    @GetMapping("/search")
    public ResponseEntity<String> search(@RequestParam Map<String, String> params) {
        return forward("https://itunes.apple.com/search", params);
    }

    @GetMapping("/lookup")
    public ResponseEntity<String> lookup(@RequestParam Map<String, String> params) {
        return forward("https://itunes.apple.com/lookup", params);
    }

    private ResponseEntity<String> forward(String baseUrl, Map<String, String> params) {
        // 파라미터 순서에 관계없이 같은 요청이면 같은 캐시 키가 되도록 정렬
        String cacheKey = baseUrl + "?" + new TreeMap<>(params);
        CacheEntry cached = cache.get(cacheKey);
        if (cached != null && cached.fresh()) {
            return ResponseEntity.status(cached.status)
                    .header("Content-Type", "application/json; charset=utf-8")
                    .body(cached.body);
        }

        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(baseUrl);
        // LinkedHashMap으로 받아온 순서를 그대로 유지 — iTunes 쪽 파싱에 순서가 영향을
        // 주진 않지만, 로그 등에서 원래 요청과 비교하기 쉽게 유지해둔다.
        for (Map.Entry<String, String> e : new LinkedHashMap<>(params).entrySet()) {
            builder.queryParam(e.getKey(), e.getValue());
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            // 일부 브라우저 전용 차단 규칙을 우회하기 위해 일반적인 서버 요청임을 명시
            headers.set("User-Agent", "Mozilla/5.0 (compatible; SyncApp/1.0; +server)");
            HttpEntity<Void> entity = new HttpEntity<>(headers);

            ResponseEntity<String> res = restTemplate.exchange(
                    builder.build().encode().toUri(), HttpMethod.GET, entity, String.class);

            // 성공한 응답만 캐시 — 레이트리밋/에러 응답을 캐시해버리면 6시간 동안 계속 빈 결과만 나감
            if (res.getStatusCode().is2xxSuccessful()) {
                cache.put(cacheKey, new CacheEntry(res.getBody(), res.getStatusCode().value()));
            }
            return ResponseEntity.status(res.getStatusCode())
                    .header("Content-Type", "application/json; charset=utf-8")
                    .body(res.getBody());
        } catch (Exception e) {
            System.err.println("[iTunes Proxy] 요청 실패 (" + baseUrl + "): " + e.getMessage());
            // 레이트리밋(429) 등으로 실패했더라도, 예전에 같은 검색어로 받아둔 캐시가 있으면
            // (비록 6시간이 지나 "신선"하진 않더라도) 빈 결과보다는 그걸 돌려주는 게 낫다
            if (cached != null) {
                return ResponseEntity.status(cached.status)
                        .header("Content-Type", "application/json; charset=utf-8")
                        .body(cached.body);
            }
            return ResponseEntity.ok("{\"results\":[]}");
        }
    }
}
