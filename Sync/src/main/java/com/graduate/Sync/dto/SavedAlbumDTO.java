package com.graduate.Sync.dto;

import com.graduate.Sync.entity.SavedAlbumEntity;
import com.graduate.Sync.entity.UserEntity;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SavedAlbumDTO {

    private String albumExternalId;
    private String albumName;
    private String artistName;
    private String albumArtUrl;
    private String releaseYear;

    public SavedAlbumEntity toEntity(UserEntity user) {
        return new SavedAlbumEntity(
                null,
                user,
                albumExternalId,
                albumName,
                artistName,
                albumArtUrl,
                releaseYear,
                null
        );
    }
}
