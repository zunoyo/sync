package com.graduate.Sync.dto;

import com.graduate.Sync.entity.SpotifyAuthEntity;
import com.graduate.Sync.entity.UserEntity;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;

@Getter
@Setter
public class SpotifyAuthDTO {

    private Long          id;
    private String        spotifyUserId;  // Spotify 계정 ID
    private String        accessToken;   // 액세스 토큰
    private String        refreshToken;  // 리프레시 토큰
    private LocalDateTime expiresAt;     // 만료 시각
    private String        scope;         // 권한 범위

    // DTO → Entity 변환 (최초 Spotify 연동 시)
    public SpotifyAuthEntity toEntity(UserEntity user) {
        return new SpotifyAuthEntity(
                null,
                user,
                spotifyUserId,
                accessToken,
                refreshToken,
                expiresAt,
                scope,
                null,   // created_at (PrePersist 자동 설정)
                null    // updated_at (PrePersist 자동 설정)
        );
    }
}