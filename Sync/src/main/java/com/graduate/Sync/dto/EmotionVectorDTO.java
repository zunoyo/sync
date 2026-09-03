package com.graduate.Sync.dto;

import com.graduate.Sync.entity.EmotionVectorEntity;
import com.graduate.Sync.entity.UserEntity;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class EmotionVectorDTO {

    private String inputType;
    private String inputText;
    private String imageUrl;
    private String inputSummary;
    private String clipEmbedding;
    private String primaryEmotion;
    private String secondaryEmotion;
    private Float  valence;
    private Float  arousal;
    private Float  confidence;
    private String lastfmTags;

    public EmotionVectorEntity toEntity(UserEntity user) {
        return new EmotionVectorEntity(
            null,
            user,
            inputType,
            inputText,
            imageUrl,
            inputSummary,
            clipEmbedding,
            primaryEmotion,
            secondaryEmotion,
            valence,
            arousal,
            confidence,
            lastfmTags != null ? lastfmTags : "[\"pop\", \"music\"]",
            null
        );
    }
}
