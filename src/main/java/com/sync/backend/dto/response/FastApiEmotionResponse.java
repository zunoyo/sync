package com.sync.backend.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;
import java.util.Map;

@Getter
public class FastApiEmotionResponse {
  //FastAPI 응답을 Java 객체로 변환하는 클래스
    @JsonProperty("primary_emotion")
    private String primaryEmotion;

    @JsonProperty("secondary_emotion")
    private String secondaryEmotion;

    @JsonProperty("emotion_scores")
    private Map<String, Double> emotionScores;

    @JsonProperty("lastfm_tags")
    private List<String> lastfmTags;
}
