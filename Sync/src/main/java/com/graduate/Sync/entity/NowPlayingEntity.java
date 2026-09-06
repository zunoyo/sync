package com.graduate.Sync.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 사용자가 "마지막으로 재생한 곡" 딱 1행만 유지하는 테이블.
 * play_history(전체 재생 이력, 계속 누적)와는 별개 — 재생할 때마다 기존 행을 갱신(update)만 하므로
 * 계정 수만큼만 행이 생기고, 재생 횟수만큼 늘어나지 않음.
 * users.id를 그대로 PK로 사용해 사용자당 정확히 1행만 존재하도록 함(upsert 대상).
 */
@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Entity
@Table(name = "now_playing")
public class NowPlayingEntity {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "spotify_track_id", length = 100)
    private String spotifyTrackId;

    @Column(name = "track_name", nullable = false, length = 255)
    private String trackName;

    @Column(name = "artist_name", length = 255)
    private String artistName;

    // 마지막으로 재생된 출처: sync_rec / playlist / search / playback 등
    @Column(name = "source", length = 20)
    private String source;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    public void touch() {
        this.updatedAt = LocalDateTime.now();
    }
}
