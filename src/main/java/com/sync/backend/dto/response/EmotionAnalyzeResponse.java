package com.sync.backend.dto.response;

import com.sync.backend.domain.EmotionVector;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Getter
@Builder
public class EmotionAnalyzeResponse {
  //최종적으로 사용자에게 돌려주는 응답 형태
    private Long id;
    private String primaryEmotion;
    private String secondaryEmotion;
    private Map<String, Double> emotionScores;
    private List<String> lastfmTags;
    private String inputType;
    private LocalDateTime createdAt;

    public static EmotionAnalyzeResponse from(EmotionVector vector) {
        return EmotionAnalyzeResponse.builder()
                .id(vector.getId())
                .primaryEmotion(vector.getPrimaryEmotion())
                .secondaryEmotion(vector.getSecondaryEmotion())
                .emotionScores(vector.getEmotionScores())
                .lastfmTags(vector.getLastfmTags())
                .inputType(vector.getInputType())
                .createdAt(vector.getCreatedAt())
                .build();
    }
}
