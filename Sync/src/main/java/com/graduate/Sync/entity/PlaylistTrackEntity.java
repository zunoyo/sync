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
@Table(name = "playlist_track")
public class PlaylistTrackEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "playlist_id", nullable = false)
    @JsonIgnore   // 프론트는 트랙 응답에서 playlist를 안 씀 + open-in-view=false라 지연로딩 직렬화 시 오류 방지
    private PlaylistEntity playlist;

    // Spotify 정보 (필수 — 실제 DB 기준. 매칭 실패 시 대체 ID/이름을 채워서 저장)
    @Column(name = "spotify_track_id", nullable = false, length = 100)
    private String spotifyTrackId;

    @Column(name = "spotify_track_name", nullable = false, length = 255)
    private String spotifyTrackName;

    @Column(name = "spotify_artist_name", nullable = false, length = 255)
    private String spotifyArtistName;

    @Column(name = "spotify_album_name", length = 255)
    private String spotifyAlbumName;

    @Column(name = "spotify_album_art_url", length = 500)
    private String spotifyAlbumArtUrl;

    @Column(name = "spotify_preview_url", length = 500)
    private String spotifyPreviewUrl;

    @Column(name = "spotify_duration_ms")
    private Integer spotifyDurationMs;

    @Column(name = "order_index", columnDefinition = "INT DEFAULT 0")
    private int orderIndex = 0;

    // Last.fm 정보 (선택 — Spotify 매핑 실패 시 대비용 백업)
    @Column(name = "lastfm_track_name", length = 255)
    private String lastfmTrackName;

    @Column(name = "lastfm_artist_name", length = 255)
    private String lastfmArtistName;

    @Column(name = "added_at")
    private LocalDateTime addedAt;

    @PrePersist
    public void prePersist() {
        this.addedAt = LocalDateTime.now();
    }
}
