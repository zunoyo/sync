package com.graduate.Sync.repository;

import com.graduate.Sync.entity.EmotionVectorEntity;
import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.RecommendationHistoryEntity;
import com.graduate.Sync.entity.UserEntity;
import org.springframework.data.repository.CrudRepository;

import java.util.List;

public interface RecommendationHistoryRepository
        extends CrudRepository<RecommendationHistoryEntity, Long> {

    // 사용자의 전체 추천 이력 (최신순)
    List<RecommendationHistoryEntity> findByUserOrderByCreatedAtDesc(
            UserEntity user);

    // 사용자의 최근 추천 이력 5개
    List<RecommendationHistoryEntity> findTop5ByUserOrderByCreatedAtDesc(
            UserEntity user);

    // 특정 감정 분석 기반 추천 이력 조회
    List<RecommendationHistoryEntity> findByEmotionVector(
            EmotionVectorEntity emotionVector);

    // 피드백 있는 추천 이력만 조회 (모델 개선용)
    List<RecommendationHistoryEntity> findByUserAndUserFeedbackIsNotNull(
            UserEntity user);

    // 플레이리스트 삭제 전 참조 기록 정리용 — FK 제약(fk_rec_history_playlist_id) 때문에 필요
    void deleteByPlaylist(PlaylistEntity playlist);
}