package com.sync.backend.dto.response;

import com.sync.backend.domain.EmotionVector;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

@Getter
@Builder
public class EmotionAnalyzeResponse {

    private Long id;
    private Double valence;
    private Double arousal;
    private List<String> lastfmTags;
    private String inputType;
    private LocalDateTime createdAt;

    public static EmotionAnalyzeResponse from(EmotionVector vector) {
        return EmotionAnalyzeResponse.builder()
                .id(vector.getId())
                .valence(vector.getValence())
                .arousal(vector.getArousal())
                .lastfmTags(vector.getLastfmTags())
                .inputType(vector.getInputType())
                .createdAt(vector.getCreatedAt())
                .build();
    }
}
