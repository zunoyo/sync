package com.graduate.Sync.service;

import com.graduate.Sync.dto.PlayHistoryDTO;
import com.graduate.Sync.entity.EmotionVectorEntity;
import com.graduate.Sync.entity.NowPlayingEntity;
import com.graduate.Sync.entity.PlayHistoryEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.repository.EmotionVectorRepository;
import com.graduate.Sync.repository.NowPlayingRepository;
import com.graduate.Sync.repository.PlayHistoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class PlayHistoryService {

    @Autowired
    private PlayHistoryRepository playHistoryRepository;

    @Autowired
    private EmotionVectorRepository emotionVectorRepository;

    @Autowired
    private NowPlayingRepository nowPlayingRepository;

    /* ── 재생 기록 저장 ────────────────────────────────── */
    public PlayHistoryEntity record(PlayHistoryDTO dto, UserEntity user) {

        // Sync 추천 재생 시 emotionVector 연결, 아니면 null
        EmotionVectorEntity emotionVector = null;

        if ("sync_rec".equals(dto.getSource())
                && dto.getEmotionVectorId() != null) {
            emotionVector = emotionVectorRepository
                    .findById(dto.getEmotionVectorId())
                    .orElse(null);
        }

        PlayHistoryEntity entity = dto.toEntity(user, emotionVector);
        PlayHistoryEntity saved = playHistoryRepository.save(entity);

        // 전체 이력(play_history)과 별개로, "마지막 재생곡" 1행은 계속 갱신(upsert)만 함
        upsertNowPlaying(dto, user);

        return saved;
    }

    /* ── 마지막 재생곡 upsert — 사용자당 1행만 유지, 재생할 때마다 그 행만 갱신 ── */
    private void upsertNowPlaying(PlayHistoryDTO dto, UserEntity user) {
        NowPlayingEntity entity = nowPlayingRepository
                .findById(user.getId())
                .orElseGet(NowPlayingEntity::new);

        entity.setUserId(user.getId());
        entity.setSpotifyTrackId(dto.getSpotifyTrackId());
        entity.setTrackName(dto.getTrackName());
        entity.setArtistName(dto.getArtistName());
        entity.setSource(dto.getSource());

        nowPlayingRepository.save(entity);
    }

    /* ── 마지막 재생곡 조회 (now_playing 1행 — 로그인 시 플레이어 복원용) ── */
    public Optional<NowPlayingEntity> getNowPlaying(UserEntity user) {
        return nowPlayingRepository.findById(user.getId());
    }

    /* ── 사용자 전체 재생 이력 조회 ───────────────────── */
    public List<PlayHistoryEntity> getHistory(UserEntity user) {
        return playHistoryRepository
                .findByUserOrderByPlayedAtDesc(user);
    }

    /* ── 최근 재생 10곡 조회 (홈 화면용) ─────────────── */
    public List<PlayHistoryEntity> getRecentTracks(UserEntity user) {
        return playHistoryRepository
                .findTop10ByUserOrderByPlayedAtDesc(user);
    }

    /* ── 마지막으로 재생한 곡 1건 조회 (로그인 시 플레이어 복원용) ── */
    public Optional<PlayHistoryEntity> getLastPlayed(UserEntity user) {
        return playHistoryRepository.findTopByUserOrderByPlayedAtDesc(user);
    }

    /* ── 출처별 재생 이력 조회 ─────────────────────────
       source: sync_rec / playlist / search
    ─────────────────────────────────────────────────── */
    public List<PlayHistoryEntity> getBySource(UserEntity user,
                                               String source) {
        return playHistoryRepository
                .findByUserAndSourceOrderByPlayedAtDesc(user, source);
    }

    /* ── Sync 추천으로 재생한 이력만 조회 ─────────────── */
    public List<PlayHistoryEntity> getSyncHistory(UserEntity user) {
        return playHistoryRepository
                .findByUserAndEmotionVectorIsNotNull(user);
    }
}