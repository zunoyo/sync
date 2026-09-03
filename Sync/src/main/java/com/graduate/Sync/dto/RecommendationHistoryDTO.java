package com.graduate.Sync.dto;

import com.graduate.Sync.entity.EmotionVectorEntity;
import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.RecommendationHistoryEntity;
import com.graduate.Sync.entity.UserEntity;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class RecommendationHistoryDTO {

    private Long    id;
    private Long    emotionVectorId;  // 감정 분석 ID
    private Long    playlistId;       // 생성된 플레이리스트 ID
    private Integer userFeedback;     // 피드백 (1/0/null)
    private String  lastfmTagsUsed;   // 사용된 Last.fm 태그 (JSON)
    private Integer trackCount;       // 추천 트랙 수

    // DTO → Entity 변환
    public RecommendationHistoryEntity toEntity(UserEntity user,
                                                EmotionVectorEntity emotionVector,
                                                PlaylistEntity playlist) {
        return new RecommendationHistoryEntity(
                null,
                user,
                emotionVector,
                playlist,
                null,          // userFeedback (초기값 NULL)
                lastfmTagsUsed,
                trackCount,
                null           // created_at (PrePersist 자동 설정)
        );
    }
}
