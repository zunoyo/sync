package com.sync.backend.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;

@Getter
public class FastApiEmotionResponse {

    @JsonProperty("valence")
    private Double valence;

    @JsonProperty("arousal")
    private Double arousal;

    @JsonProperty("lastfm_tags")
    private List<String> lastfmTags;
}
