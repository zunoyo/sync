package com.graduate.Sync.dto;

import com.graduate.Sync.entity.EmotionVectorEntity;
import com.graduate.Sync.entity.PlayHistoryEntity;
import com.graduate.Sync.entity.UserEntity;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;

@Getter
@Setter
public class PlayHistoryDTO {

    private Long          id;
    private String        spotifyTrackId;   // Spotify 트랙 ID
    private String        trackName;        // 트랙명
    private String        artistName;       // 아티스트명
    private LocalDateTime playedAt;         // 재생 시각
    private String        source;           // sync_rec / playlist / search
    private Long          emotionVectorId;  // 감정 분석 ID (선택)

    // DTO → Entity 변환
    public PlayHistoryEntity toEntity(UserEntity user,
                                      EmotionVectorEntity emotionVector) {
        return new PlayHistoryEntity(
                null,
                user,
                spotifyTrackId,
                trackName,
                artistName,
                playedAt,
                source,
                emotionVector,  // sync_rec 이 아니면 null
                null            // created_at (PrePersist 자동 설정)
        );
    }
}