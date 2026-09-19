package com.graduate.Sync.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

/**
 * 소셜 로그인(Google / Naver) 연동 정보.
 * 한 사용자가 여러 provider를 동시에 연결할 수 있도록 users와 N:1 관계로 설계.
 * (spotify_auth는 음악 재생 권한용 1:1 연동이라 별개 — 이 테이블은 "로그인 수단" 전용)
 */
@NoArgsConstructor
@AllArgsConstructor
@Getter
@Entity
@Table(name = "oauth_accounts",
       uniqueConstraints = @UniqueConstraint(columnNames = {"provider", "provider_user_id"}))
public class OAuthAccountEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // users 테이블 참조 (N:1)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    // "google" | "naver"
    @Column(name = "provider", nullable = false, length = 20)
    private String provider;

    // 각 provider가 발급하는 사용자 고유 ID (Google: sub, Naver: id)
    @Column(name = "provider_user_id", nullable = false, length = 100)
    private String providerUserId;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
    }
}
