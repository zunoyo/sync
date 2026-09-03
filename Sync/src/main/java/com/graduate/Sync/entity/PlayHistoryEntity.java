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
@Table(name = "play_history")
public class PlayHistoryEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // users 테이블 참조
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    // Spotify 트랙 ID
    @Column(name = "spotify_track_id", nullable = false, length = 100)
    private String spotifyTrackId;

    // 트랙명
    @Column(name = "track_name", nullable = false, length = 255)
    private String trackName;

    // 아티스트명 (NULL 허용)
    @Column(name = "artist_name", length = 255)
    private String artistName;

    // 재생 시각
    @Column(name = "played_at")
    private LocalDateTime playedAt;

    // 재생 출처: sync_rec / playlist / search
    @Column(name = "source", nullable = false, length = 20)
    private String source;

    // Sync 추천 기반 재생 시 감정 분석 ID (선택적)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "emotion_vector_id", nullable = true)
    private EmotionVectorEntity emotionVector;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
        // played_at 미설정 시 현재 시각으로 자동 설정
        if (this.playedAt == null) {
            this.playedAt = LocalDateTime.now();
        }
    }
}