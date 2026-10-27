package com.graduate.Sync.dto;

import com.graduate.Sync.entity.EmotionVectorEntity;
import com.graduate.Sync.entity.UserEntity;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

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

    // DB에 저장 안 함 — 이미지 단독 입력의 '확실/보통/애매'(high/mid/low). 그 외 입력은 null
    private String reliability;

    // 사용자가 고른 선호 장르(Last.fm 태그, 예: "k-pop", "jazz"). 선택하지 않으면 null/빈 리스트.
    // 요청에만 쓰이고 DB에는 저장하지 않음.
    private List<String> genres;

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
