package com.graduate.Sync.service;

import com.graduate.Sync.dto.PlaylistDTO;
import com.graduate.Sync.dto.PlaylistTrackDTO;
import com.graduate.Sync.dto.RecommendationHistoryDTO;
import com.graduate.Sync.entity.*;
import com.graduate.Sync.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class RecommendationService {

    @Autowired
    private EmotionVectorRepository       emotionVectorRepository;

    @Autowired
    private PlaylistRepository            playlistRepository;

    @Autowired
    private PlaylistTrackRepository       playlistTrackRepository;

    @Autowired
    private RecommendationHistoryRepository recommendationHistoryRepository;

    @Autowired
    private SpotifyAuthService spotifyAuthService;

    @Autowired
    private RestTemplate restTemplate;

    // application.properties 에서 설정
    @Value("${lastfm.api.key}")
    private String lastfmApiKey;

    /* ══ 전체 추천 파이프라인 ══════════════════════════════
       ① emotion_vector → lastfm_tags 추출
       ② Last.fm API   → 트랙 목록 수신
       ③ Spotify API   → 트랙 매핑
       ④ playlist 생성 (ai_recommended)
       ⑤ playlist_track 저장
       ⑥ recommendation_history 저장
    ════════════════════════════════════════════════════ */
    @Transactional
    public RecommendationHistoryEntity recommend(Long emotionVectorId,
                                                 UserEntity user) {
        // ① emotion_vector 조회
        EmotionVectorEntity emotionVector =
                emotionVectorRepository.findById(emotionVectorId).orElse(null);
        if (emotionVector == null) return null;

        // ② lastfm_tags JSON → List<String> 파싱
        List<String> tags = parseJsonArray(emotionVector.getLastfmTags());
        if (tags.isEmpty()) return null;

        // ②-1 arousal로 태그 우선순위 보강 — valence는 이미 primary_emotion 분류에
        //     반영돼 있으므로 여기선 arousal만 본다. 같은 emotion_vector라도 이미지에
        //     따라 arousal이 다르면(예: 파티 사진 happy vs 혼자 잔잔한 happy) 서로
        //     다른 곡이 나가도록 함 (문서 13/14장: happy+high arousal→upbeat/dance,
        //     happy+low arousal→chill/acoustic). 기존 태그는 지우지 않고 앞에만
        //     붙여서, 이 태그로 곡이 부족하면 자연히 원래 태그로 폴백된다.
        tags = withArousalRefinement(tags, emotionVector.getArousal());

        // ③ Last.fm API로 태그별 트랙 검색
        List<Map<String, String>> lastfmTracks = searchLastFmTracks(tags);
        if (lastfmTracks.isEmpty()) return null;

        // ④ Spotify 유효 토큰 조회
        String accessToken = spotifyAuthService.getValidToken(user);
        if (accessToken == null) return null;

        // ⑤ Last.fm 트랙 → Spotify 매핑
        List<PlaylistTrackDTO> spotifyTracks =
                mapToSpotify(lastfmTracks, accessToken);

        // ⑥ AI 추천 플레이리스트 생성
        PlaylistEntity playlist = createAiPlaylist(
                emotionVector.getPrimaryEmotion(), user);

        // ⑦ playlist_track 저장
        savePlaylistTracks(spotifyTracks, playlist);

        // ⑧ recommendation_history 저장 — 원본 emotionVector.getLastfmTags()가
        //    아니라 arousal 보강까지 반영된 tags(실제 검색에 쓰인 것)를 그대로
        //    남긴다. 안 그러면 이력에는 옛날 태그만 남고, 실제로 뭘로 검색했는지
        //    나중에 확인할 방법이 없어짐.
        return saveRecommendationHistory(
                user, emotionVector, playlist,
                toJsonArray(tags),
                spotifyTracks.size());
    }

    /* ── List<String> → JSON 배열 문자열 (parseJsonArray의 역변환) ───── */
    private String toJsonArray(List<String> tags) {
        return "[" + tags.stream()
                .map(t -> "\"" + t.replace("\"", "\\\"") + "\"")
                .collect(Collectors.joining(",")) + "]";
    }

    /* ── Last.fm 태그별 트랙 검색 ─────────────────────── */
    private List<Map<String, String>> searchLastFmTracks(List<String> tags) {
        List<Map<String, String>> result = new ArrayList<>();

        for (String tag : tags) {
            try {
                String url = "http://ws.audioscrobbler.com/2.0/"
                        + "?method=tag.gettoptracks"
                        + "&tag=" + tag
                        + "&api_key=" + lastfmApiKey
                        + "&format=json"
                        + "&limit=5";

                ResponseEntity<Map> response =
                        restTemplate.getForEntity(url, Map.class);

                Map<String, Object> body = response.getBody();
                if (body == null) continue;

                // tracks.track 배열 추출
                Map<String, Object> tracks =
                        (Map<String, Object>) body.get("tracks");
                if (tracks == null) continue;

                List<Map<String, Object>> trackList =
                        (List<Map<String, Object>>) tracks.get("track");
                if (trackList == null) continue;

                for (Map<String, Object> track : trackList) {
                    String trackName  = (String) track.get("name");
                    Map<String, Object> artist =
                            (Map<String, Object>) track.get("artist");
                    String artistName = artist != null
                            ? (String) artist.get("name") : null;

                    if (trackName != null && artistName != null) {
                        Map<String, String> t = new HashMap<>();
                        t.put("name",   trackName);
                        t.put("artist", artistName);
                        result.add(t);
                    }

                    // 최대 20개 수집
                    if (result.size() >= 20) break;
                }

            } catch (Exception e) {
                System.err.println("Last.fm 호출 실패 [" + tag + "]: "
                        + e.getMessage());
            }

            if (result.size() >= 20) break;
        }

        return result;
    }

    /* ── Last.fm 트랙 → Spotify 매핑 ─────────────────── */
    private List<PlaylistTrackDTO> mapToSpotify(
            List<Map<String, String>> lastfmTracks, String accessToken) {

        List<PlaylistTrackDTO> result = new ArrayList<>();

        for (Map<String, String> track : lastfmTracks) {
            try {
                String query = "track:" + track.get("name")
                        + " artist:" + track.get("artist");
                String url = "https://api.spotify.com/v1/search"
                        + "?q=" + query.replace(" ", "%20")
                        + "&type=track&limit=1";

                HttpHeaders headers = new HttpHeaders();
                headers.set("Authorization", "Bearer " + accessToken);
                HttpEntity<Void> request = new HttpEntity<>(headers);

                ResponseEntity<Map> response = restTemplate.exchange(
                        url, HttpMethod.GET, request, Map.class);

                Map<String, Object> body = response.getBody();
                if (body == null) continue;

                // tracks.items[0] 추출
                Map<String, Object> tracks =
                        (Map<String, Object>) body.get("tracks");
                if (tracks == null) continue;

                List<Map<String, Object>> items =
                        (List<Map<String, Object>>) tracks.get("items");
                if (items == null || items.isEmpty()) continue;

                Map<String, Object> item = items.get(0);

                // Spotify 트랙 데이터 추출
                String spotifyTrackId   = (String) item.get("id");
                String spotifyTrackName = (String) item.get("name");
                Integer durationMs      = (Integer) item.get("duration_ms");
                String previewUrl       = (String) item.get("preview_url");

                List<Map<String, Object>> artists =
                        (List<Map<String, Object>>) item.get("artists");
                String artistName = (artists != null && !artists.isEmpty())
                        ? (String) artists.get(0).get("name") : null;

                Map<String, Object> album =
                        (Map<String, Object>) item.get("album");
                String albumName   = album != null
                        ? (String) album.get("name") : null;
                String albumArtUrl = null;

                if (album != null) {
                    List<Map<String, Object>> images =
                            (List<Map<String, Object>>) album.get("images");
                    if (images != null && !images.isEmpty()) {
                        albumArtUrl = (String) images.get(0).get("url");
                    }
                }

                // DTO 구성
                PlaylistTrackDTO dto = new PlaylistTrackDTO();
                dto.setSpotifyTrackId(spotifyTrackId);
                dto.setSpotifyTrackName(spotifyTrackName);
                dto.setSpotifyArtistName(artistName);
                dto.setSpotifyAlbumName(albumName);
                dto.setSpotifyAlbumArtUrl(albumArtUrl);
                dto.setSpotifyPreviewUrl(previewUrl);
                dto.setSpotifyDurationMs(durationMs);
                dto.setLastfmTrackName(track.get("name"));
                dto.setLastfmArtistName(track.get("artist"));

                result.add(dto);

            } catch (Exception e) {
                System.err.println("Spotify 검색 실패: " + e.getMessage());
            }

            // 최대 10곡
            if (result.size() >= 10) break;
        }

        return result;
    }

    /* ── AI 추천 플레이리스트 생성 ────────────────────── */
    private PlaylistEntity createAiPlaylist(String emotion,
                                            UserEntity user) {
        PlaylistDTO dto = new PlaylistDTO();
        dto.setPlaylistName(emotion + " 감정 추천");
        dto.setPublic(false);
        dto.setSource("ai_recommended");

        PlaylistEntity playlist = dto.toEntity(user);
        return playlistRepository.save(playlist);
    }

    /* ── playlist_track 저장 ──────────────────────────── */
    private void savePlaylistTracks(List<PlaylistTrackDTO> tracks,
                                    PlaylistEntity playlist) {
        for (int i = 0; i < tracks.size(); i++) {
            PlaylistTrackDTO dto = tracks.get(i);
            dto.setOrderIndex(i + 1);
            playlistTrackRepository.save(dto.toEntity(playlist));
        }
    }

    /* ── recommendation_history 저장 ─────────────────── */
    private RecommendationHistoryEntity saveRecommendationHistory(
            UserEntity user,
            EmotionVectorEntity emotionVector,
            PlaylistEntity playlist,
            String lastfmTagsUsed,
            int trackCount) {

        RecommendationHistoryDTO dto = new RecommendationHistoryDTO();
        dto.setLastfmTagsUsed(lastfmTagsUsed);
        dto.setTrackCount(trackCount);

        RecommendationHistoryEntity history =
                dto.toEntity(user, emotionVector, playlist);
        return recommendationHistoryRepository.save(history);
    }

    /* ── 추천 이력 조회 ───────────────────────────────── */
    public List<RecommendationHistoryEntity> getHistory(UserEntity user) {
        return recommendationHistoryRepository
                .findByUserOrderByCreatedAtDesc(user);
    }

    /* ── 피드백 업데이트 ──────────────────────────────── */
    public RecommendationHistoryEntity updateFeedback(Long historyId,
                                                      Integer feedback) {
        RecommendationHistoryEntity history =
                recommendationHistoryRepository.findById(historyId)
                        .orElse(null);
        if (history == null) return null;

        history.updateFeedback(feedback);
        return recommendationHistoryRepository.save(history);
    }

    /* ── arousal 기반 태그 보강 ────────────────────────
       같은 primary_emotion(예: happy)이라도 이 이미지의 arousal이 높은지
       낮은지에 따라 다른 수식어 태그를 앞에 붙인다. 장르 전반에 걸쳐
       흔히 쓰이는 Last.fm 태그로 골랐고(특정 감정 전용 태그가 아님),
       valence 축은 건드리지 않는다 — 그건 이미 primary_emotion 분류가
       담당하고 있음. */
    private List<String> withArousalRefinement(List<String> baseTags, Float arousal) {
        if (arousal == null) return baseTags;

        List<String> modifiers = (arousal >= 0)
                ? List.of("upbeat", "dance", "energetic")
                : List.of("chill", "acoustic", "slow");

        List<String> merged = new ArrayList<>(modifiers);
        merged.addAll(baseTags);
        return merged;
    }

    /* ── JSON 배열 문자열 → List<String> 파싱 ─────────── */
    private List<String> parseJsonArray(String json) {
        List<String> result = new ArrayList<>();
        if (json == null || json.isBlank()) return result;

        // [ ] 제거
        String cleaned = json.trim()
                .replaceAll("^\\[|]$", "")
                .trim();
        if (cleaned.isEmpty()) return result;

        // 쉼표로 분리 후 따옴표 제거
        for (String item : cleaned.split(",")) {
            String tag = item.trim()
                    .replaceAll("^\"|\"$", "")
                    .trim();
            if (!tag.isEmpty()) {
                result.add(tag);
            }
        }
        return result;
    }
}