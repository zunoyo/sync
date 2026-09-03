package com.graduate.Sync.dto;

import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.PlaylistTrackEntity;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PlaylistTrackDTO {

    private Long    id;
    private Long    playlistId;

    // Spotify (실제 DB 기준 필수 — 매칭 실패 시 대체 ID/이름을 채워서 전달해야 함)
    private String  spotifyTrackId;
    private String  spotifyTrackName;
    private String  spotifyArtistName;
    private String  spotifyAlbumName;
    private String  spotifyAlbumArtUrl;
    private String  spotifyPreviewUrl;
    private Integer spotifyDurationMs;

    // Last.fm (선택 — 백업용)
    private String  lastfmTrackName;
    private String  lastfmArtistName;

    private int     orderIndex;

    public PlaylistTrackEntity toEntity(PlaylistEntity playlist) {
        return new PlaylistTrackEntity(
            null,
            playlist,
            spotifyTrackId,
            spotifyTrackName,
            spotifyArtistName,
            spotifyAlbumName,
            spotifyAlbumArtUrl,
            spotifyPreviewUrl,
            spotifyDurationMs,
            orderIndex,
            lastfmTrackName,
            lastfmArtistName,
            null
        );
    }
}
