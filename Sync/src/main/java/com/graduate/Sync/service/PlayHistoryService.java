package com.graduate.Sync.service;

import com.graduate.Sync.dto.PlayHistoryDTO;
import com.graduate.Sync.entity.EmotionVectorEntity;
import com.graduate.Sync.entity.PlayHistoryEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.repository.EmotionVectorRepository;
import com.graduate.Sync.repository.PlayHistoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PlayHistoryService {

    @Autowired
    private PlayHistoryRepository playHistoryRepository;

    @Autowired
    private EmotionVectorRepository emotionVectorRepository;

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
        return playHistoryRepository.save(entity);
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