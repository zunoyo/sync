package com.graduate.Sync.dto;

import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.UserEntity;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PlaylistDTO {

    private Long    id;
    private String  playlistName;
    private boolean isPublic;
    private String  source;
    private String  emoji;
    private String  gradient;

    public PlaylistEntity toEntity(UserEntity user) {
        return new PlaylistEntity(
                null,                                               // id
                null,                                               // playlistId
                playlistName,                                       // playlistName
                isPublic,                                           // isPublic
                source != null ? source : "user_created",           // source
                emoji,                                               // emoji
                gradient,                                            // gradient
                user,                                               // user
                null,                                               // createdAt
                null                                                // updatedAt
        );
    }
}