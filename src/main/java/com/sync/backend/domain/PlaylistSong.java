package com.sync.backend.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "playlist_song")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class PlaylistSong {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "playlist_id", nullable = false)
    private Long playlistId;

    @Column(name = "lastfm_track_name", nullable = false)
    private String lastfmTrackName;

    @Column(name = "lastfm_artist_name", nullable = false)
    private String lastfmArtistName;

    @Column(name = "spotify_track_id", length = 100)
    private String spotifyTrackId;

    @Column(name = "spotify_artist_name")
    private String spotifyArtistName;

    @Column(name = "spotify_album_name")
    private String spotifyAlbumName;

    @Column(name = "spotify_preview_url", length = 500)
    private String spotifyPreviewUrl;

    @Column(name = "order_index", nullable = false)
    private int orderIndex;

    @Column(name = "added_at", nullable = false, insertable = false, updatable = false)
    private LocalDateTime addedAt;
}
