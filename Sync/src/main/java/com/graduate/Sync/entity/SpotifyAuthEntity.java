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
@Table(name = "spotify_auth")
public class SpotifyAuthEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // users 테이블 참조 (1:1 관계)
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private UserEntity user;

    // Spotify 계정 고유 ID
    @Column(name = "spotify_user_id", nullable = false, length = 255)
    private String spotifyUserId;

    // Spotify API 호출용 액세스 토큰 (1시간 만료)
    @Column(name = "access_token", nullable = false, length = 500)
    private String accessToken;

    // 액세스 토큰 재발급용 리프레시 토큰
    @Column(name = "refresh_token", nullable = false, length = 550)
    private String refreshToken;

    // 액세스 토큰 만료 시각
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    // 부여된 Spotify 권한 범위
    @Column(name = "scope", length = 260)
    private String scope;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    // 토큰 만료 여부 확인
    public boolean isExpired() {
        return LocalDateTime.now().isAfter(this.expiresAt);
    }

    // 액세스 토큰 갱신 (refresh_token으로 재발급 후 호출)
    public void updateTokens(String newAccessToken,
                             String newRefreshToken,
                             LocalDateTime newExpiresAt) {
        this.accessToken  = newAccessToken;
        this.refreshToken = newRefreshToken;
        this.expiresAt    = newExpiresAt;
    }
}