package com.graduate.Sync.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@NoArgsConstructor
@AllArgsConstructor
@Getter
@Entity
@Table(name = "saved_artist",
       uniqueConstraints = @UniqueConstraint(name = "uk_saved_artist_user_name",
                                              columnNames = {"user_id", "artist_name"}))
public class SavedArtistEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore
    private UserEntity user;

    @Column(name = "artist_name", nullable = false, length = 255)
    private String artistName;

    // iTunes artistId 등 외부 식별자 (있으면 저장, 없어도 됨)
    @Column(name = "artist_external_id", length = 100)
    private String artistExternalId;

    @Column(name = "artist_image_url", length = 500)
    private String artistImageUrl;

    @Column(name = "saved_at")
    private LocalDateTime savedAt;

    @PrePersist
    public void prePersist() {
        this.savedAt = LocalDateTime.now();
    }
}
