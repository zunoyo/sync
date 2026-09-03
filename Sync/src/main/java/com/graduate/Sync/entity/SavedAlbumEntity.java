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
@Table(name = "saved_album",
       uniqueConstraints = @UniqueConstraint(name = "uk_saved_album_user_external",
                                              columnNames = {"user_id", "album_external_id"}))
public class SavedAlbumEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore
    private UserEntity user;

    // iTunes collectionId (앨범 고유 식별자)
    @Column(name = "album_external_id", nullable = false, length = 100)
    private String albumExternalId;

    @Column(name = "album_name", nullable = false, length = 255)
    private String albumName;

    @Column(name = "artist_name", length = 255)
    private String artistName;

    @Column(name = "album_art_url", length = 500)
    private String albumArtUrl;

    @Column(name = "release_year", length = 10)
    private String releaseYear;

    @Column(name = "saved_at")
    private LocalDateTime savedAt;

    @PrePersist
    public void prePersist() {
        this.savedAt = LocalDateTime.now();
    }
}
