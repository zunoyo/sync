package com.graduate.Sync.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@NoArgsConstructor
@AllArgsConstructor
@Getter
@Entity
@Table(name = "recommendation_history")
public class RecommendationHistoryEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // users 테이블 참조
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    // emotion_vector 테이블 참조 (기반이 된 감정 분석)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "emotion_vector_id", nullable = false)
    private EmotionVectorEntity emotionVector;

    // playlist 테이블 참조 (생성된 추천 플레이리스트)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "playlist_id", nullable = false)
    private PlaylistEntity playlist;

    // 사용자 피드백 (1=좋음, 0=나쁨, NULL=미응답)
    @Column(name = "user_feedback",
            columnDefinition = "TINYINT DEFAULT NULL")
    private Integer userFeedback;

    // 실제 Last.fm 검색에 사용된 태그 목록 (JSON 배열)
    @Column(name = "lastfm_tags_used",
            columnDefinition = "JSON")
    private String lastfmTagsUsed;

    // 추천된 트랙 수
    @Column(name = "track_count")
    private Integer trackCount;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    // 사용자 피드백 업데이트 (추천 후 사용자가 평가 시 호출)
    public void updateFeedback(Integer feedback) {
        this.userFeedback = feedback;
    }
}