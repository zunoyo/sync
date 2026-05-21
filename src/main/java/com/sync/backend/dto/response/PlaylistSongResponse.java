package com.sync.backend.dto.response;

import com.sync.backend.domain.PlaylistSong;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class PlaylistSongResponse {

    private Long id;
    private String lastfmTrackName;
    private String lastfmArtistName;
    private String spotifyTrackId;
    private String spotifyArtistName;
    private String spotifyAlbumName;
    private String spotifyPreviewUrl;
    private int orderIndex;

    public static PlaylistSongResponse from(PlaylistSong song) {
        return PlaylistSongResponse.builder()
                .id(song.getId())
                .lastfmTrackName(song.getLastfmTrackName())
                .lastfmArtistName(song.getLastfmArtistName())
                .spotifyTrackId(song.getSpotifyTrackId())
                .spotifyArtistName(song.getSpotifyArtistName())
                .spotifyAlbumName(song.getSpotifyAlbumName())
                .spotifyPreviewUrl(song.getSpotifyPreviewUrl())
                .orderIndex(song.getOrderIndex())
                .build();
    }
}
