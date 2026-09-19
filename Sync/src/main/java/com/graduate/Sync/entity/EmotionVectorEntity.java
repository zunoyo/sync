package com.graduate.Sync.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.LocalDateTime;

@NoArgsConstructor
@AllArgsConstructor
@Getter
@Entity
@Table(name = "emotion_vector")
public class EmotionVectorEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore   // /api/sync/emotion-history 응답에 유저 엔티티 전체가 딸려나갈 필요 없음
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    @Column(name = "input_type", length = 20)
    private String inputType;

    @Column(name = "input_text", columnDefinition = "TEXT")
    private String inputText;

    // 프론트에서 이미지 업로드 시 base64 data URI 전체를 여기 담아 보내는데(URL이 아님),
    // 500자 제한이면 바로 잘려서 "Data too long" 에러가 남 — LONGTEXT로 확장
    @Column(name = "image_url", columnDefinition = "LONGTEXT")
    private String imageUrl;

    @Column(name = "input_summary", columnDefinition = "TEXT")
    private String inputSummary;

    @Column(name = "clip_embedding", columnDefinition = "JSON")
    private String clipEmbedding;

    @Column(name = "primary_emotion", length = 50)
    private String primaryEmotion;

    @Column(name = "secondary_emotion", length = 50)
    private String secondaryEmotion;

    @Column(name = "valence")
    private Float valence;

    @Column(name = "arousal")
    private Float arousal;

    @Column(name = "confidence")
    private Float confidence;

    @Column(name = "lastfm_tags", columnDefinition = "JSON")
    private String lastfmTags;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
    }
}
