package com.graduate.Sync.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    @Column(name = "input_type", length = 20)
    private String inputType;

    @Column(name = "input_text", columnDefinition = "TEXT")
    private String inputText;

    @Column(name = "image_url", length = 500)
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
