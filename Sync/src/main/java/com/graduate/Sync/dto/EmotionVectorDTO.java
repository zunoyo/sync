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

    // DB에 저장 안 함(EmotionVectorEntity엔 없는 필드) — EmoSet으로 학습된
    // 모델의 전반적 검증 정확도를 이번 응답에만 실어 보내기 위한 용도
    private Float modelValAccuracy;

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
