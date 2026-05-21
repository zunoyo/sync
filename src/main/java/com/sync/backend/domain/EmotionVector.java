package com.sync.backend.domain;

import com.sync.backend.domain.converter.ListToJsonConverter;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "emotion_vector")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class EmotionVector {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "input_type", nullable = false, length = 20)
    private String inputType;

    @Column(name = "input_summary", columnDefinition = "TEXT")
    private String inputText;

    @Column(name = "valence", nullable = false)
    private Double valence;

    @Column(name = "arousal", nullable = false)
    private Double arousal;

    @Convert(converter = ListToJsonConverter.class)
    @Column(name = "lastfm_tags", columnDefinition = "json", nullable = false)
    private List<String> lastfmTags;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
    }
}
