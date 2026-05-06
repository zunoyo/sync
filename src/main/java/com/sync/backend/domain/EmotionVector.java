package com.sync.backend.domain;

import com.sync.backend.domain.converter.ListToJsonConverter;
import com.sync.backend.domain.converter.MapToJsonConverter;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "emotion_vector")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class EmotionVector {  //데이터베이스 emotion_vector 테이블과 연결되는 Java 클래스

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    // "text" | "image" — VARCHAR(20) NOT NULL in DB
    @Column(name = "input_type", nullable = false, length = 20)
    private String inputType;

    @Column(name = "input_summary", columnDefinition = "TEXT")
    private String inputText;

    @Column(name = "primary_emotion", nullable = false, length = 50)
    private String primaryEmotion;

    @Column(name = "secondary_emotion", length = 50)
    private String secondaryEmotion;

    @Convert(converter = MapToJsonConverter.class)
    @Column(name = "emotion_scores", columnDefinition = "json")
    private Map<String, Double> emotionScores;

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
