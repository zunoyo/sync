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
@Table(name = "users")
public class UserEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false, length = 255)
    private String username;

    @Column(unique = true, nullable = false, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    @JsonIgnore   // 이 엔티티가 JSON으로 응답될 때(친구 목록, 플레이리스트 소유자 등) 절대 노출되면 안 됨
    private String passwordHash;

    @Column(name = "display_name", length = 255)
    private String displayName;

    @Column(name = "profile_image_url", length = 500)
    private String profileImageUrl;

    @Column(name = "is_active", columnDefinition = "TINYINT DEFAULT 1")
    private boolean isActive = true;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "last_active_at")
    private LocalDateTime lastActiveAt;

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    /* ── Setters (업데이트용) ── */
    public void setUsername(String username)           { this.username = username; }
    public void setEmail(String email)                 { this.email = email; }
    public void setPasswordHash(String passwordHash)   { this.passwordHash = passwordHash; }
    public void setDisplayName(String displayName)     { this.displayName = displayName; }
    public void setProfileImageUrl(String url)         { this.profileImageUrl = url; }
    public void setIsActive(boolean isActive)          { this.isActive = isActive; }

    /* ── 프로필 수정 패치 ── */
    public void patch(UserEntity other) {
        if (other.username != null)        this.username        = other.username;
        if (other.displayName != null)     this.displayName     = other.displayName;
        if (other.email != null)           this.email           = other.email;
        if (other.passwordHash != null)    this.passwordHash    = other.passwordHash;
        if (other.profileImageUrl != null) this.profileImageUrl = other.profileImageUrl;
    }

    public void updateLastActiveAt() {
        this.lastActiveAt = LocalDateTime.now();
    }
}
