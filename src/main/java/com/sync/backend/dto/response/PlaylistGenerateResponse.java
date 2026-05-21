package com.sync.backend.dto.response;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

@Getter
@Builder
public class PlaylistGenerateResponse {

    private Long playlistId;
    private String name;
    private String primaryEmotion;
    private List<PlaylistSongResponse> songs;
    private LocalDateTime createdAt;
}
