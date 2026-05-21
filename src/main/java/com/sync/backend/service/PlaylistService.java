package com.sync.backend.service;

import com.sync.backend.domain.EmotionVector;
import com.sync.backend.domain.Playlist;
import com.sync.backend.domain.PlaylistSong;
import com.sync.backend.dto.response.PlaylistGenerateResponse;
import com.sync.backend.dto.response.PlaylistSongResponse;
import com.sync.backend.repository.EmotionVectorRepository;
import com.sync.backend.repository.PlaylistRepository;
import com.sync.backend.repository.PlaylistSongRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class PlaylistService {

    private static final int TRACKS_PER_TAG = 5;
    private static final int MAX_TAGS = 4;

    private final EmotionVectorRepository emotionVectorRepository;
    private final PlaylistRepository playlistRepository;
    private final PlaylistSongRepository playlistSongRepository;
    private final LastFmService lastFmService;
    private final SpotifyService spotifyService;

    private static String quadrantLabel(double valence, double arousal) {
        if (valence >= 0 && arousal >= 0) return "excited";
        if (valence < 0  && arousal >= 0) return "intense";
        if (valence < 0  && arousal < 0)  return "melancholic";
        return "calm";
    }

    @Transactional
    public PlaylistGenerateResponse generatePlaylist(Long userId, Long emotionVectorId) {
        EmotionVector emotionVector = emotionVectorRepository
                .findByIdAndUserId(emotionVectorId, userId)
                .orElseThrow(() -> new IllegalArgumentException("감성 분석 결과를 찾을 수 없습니다."));

        List<String> tags = emotionVector.getLastfmTags();
        if (tags == null || tags.isEmpty()) {
            throw new IllegalStateException("감성 분석 태그가 없습니다.");
        }

        String primaryEmotion = quadrantLabel(emotionVector.getValence(), emotionVector.getArousal());

        Playlist playlist = playlistRepository.save(Playlist.builder()
                .userId(userId)
                .name(primaryEmotion + " 플레이리스트")
                .isPublic(true)
                .build());

        List<PlaylistSongResponse> songResponses = new ArrayList<>();
        int orderIndex = 1;

        for (String tag : tags.stream().limit(MAX_TAGS).toList()) {
            List<LastFmService.LastFmTrack> tracks = lastFmService.getTopTracksByTag(tag, TRACKS_PER_TAG);

            for (LastFmService.LastFmTrack track : tracks) {
                SpotifyService.SpotifyTrackInfo info = spotifyService
                        .searchTrack(track.name(), track.artist())
                        .orElse(null);

                PlaylistSong song = playlistSongRepository.save(PlaylistSong.builder()
                        .userId(userId)
                        .playlistId(playlist.getId())
                        .lastfmTrackName(track.name())
                        .lastfmArtistName(track.artist())
                        .spotifyTrackId(info != null ? info.trackId() : null)
                        .spotifyArtistName(info != null ? info.artistName() : null)
                        .spotifyAlbumName(info != null ? info.albumName() : null)
                        .spotifyPreviewUrl(info != null ? info.previewUrl() : null)
                        .orderIndex(orderIndex)
                        .build());

                songResponses.add(PlaylistSongResponse.from(song));
                orderIndex++;

                log.debug("곡 추가: {} - {} (tag={}, preview={})",
                        track.artist(), track.name(), tag,
                        info != null ? info.previewUrl() : "없음");
            }
        }

        log.info("플레이리스트 생성 완료 (userId={}, playlistId={}, songs={})",
                userId, playlist.getId(), songResponses.size());

        return PlaylistGenerateResponse.builder()
                .playlistId(playlist.getId())
                .name(playlist.getName())
                .primaryEmotion(primaryEmotion)
                .songs(songResponses)
                .createdAt(playlist.getCreatedAt())
                .build();
    }
}
