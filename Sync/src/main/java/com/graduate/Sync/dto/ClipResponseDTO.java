package com.graduate.Sync.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ClipResponseDTO {

    @JsonProperty("primary_emotion")
    private String primaryEmotion;

    @JsonProperty("secondary_emotion")
    private String secondaryEmotion;

    private Float valence;
    private Float arousal;
    private Float confidence;

    @JsonProperty("clip_embedding")
    private String clipEmbedding;

    @JsonProperty("lastfm_tags")
    private String lastfmTags;

    @JsonProperty("input_summary")
    private String inputSummary;

    @JsonProperty("model_val_accuracy")
    private Float modelValAccuracy;

    /** 이미지 단독 입력의 확실도: high/mid/low. 그 외 입력은 null */
    private String reliability;
}
