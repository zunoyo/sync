package com.graduate.Sync.repository;

import com.graduate.Sync.entity.EmotionVectorEntity;
import com.graduate.Sync.entity.PlayHistoryEntity;
import com.graduate.Sync.entity.UserEntity;
import org.springframework.data.repository.CrudRepository;

import java.util.List;

public interface PlayHistoryRepository
        extends CrudRepository<PlayHistoryEntity, Long> {

    // 사용자 전체 재생 이력 (최신순)
    List<PlayHistoryEntity> findByUserOrderByPlayedAtDesc(UserEntity user);

    // 사용자 최근 재생 10곡
    List<PlayHistoryEntity> findTop10ByUserOrderByPlayedAtDesc(UserEntity user);

    // 출처별 재생 이력 조회 (sync_rec / playlist / search)
    List<PlayHistoryEntity> findByUserAndSourceOrderByPlayedAtDesc(UserEntity user, String source);

    // Sync 추천으로 재생한 이력만 조회 (개인화 추천 개선용)
    List<PlayHistoryEntity> findByUserAndEmotionVectorIsNotNull(UserEntity user);

    // 특정 감정 분석 기반으로 재생한 이력 조회
    List<PlayHistoryEntity> findByEmotionVector(EmotionVectorEntity emotionVector);
}