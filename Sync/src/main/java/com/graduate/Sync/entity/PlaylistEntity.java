package com.graduate.Sync.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@NoArgsConstructor
@AllArgsConstructor
@Getter
@Entity
@Table(name = "playlist")
public class PlaylistEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "playlist_id", unique = true, length = 50)
    private String playlistId;

    @Column(name = "playlist_name", nullable = false, length = 100)
    private String playlistName;

    @Column(name = "is_public", columnDefinition = "TINYINT DEFAULT 0")
    private boolean isPublic = false;

    @Column(name = "source", length = 20,
            columnDefinition = "VARCHAR(20) DEFAULT 'user_created'")
    private String source = "user_created";

    @Column(name = "emoji", length = 10)
    private String emoji;

    @Column(name = "gradient", length = 20)
    private String gradient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore   // 프론트는 플레이리스트 응답에서 user를 안 씀 + open-in-view=false라 지연로딩 직렬화 시 오류 방지
    private UserEntity user;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        if (this.playlistId == null) {
            this.playlistId = "pl_" + System.currentTimeMillis();
        }
        if (this.source == null) {
            this.source = "user_created";
        }
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    // 친구 공유(공개) 여부 토글 — PlaylistService.updateVisibility() 에서 사용
    public void updateVisibility(boolean isPublic) {
        this.isPublic = isPublic;
    }
}
