package com.graduate.Sync.dto;

import com.graduate.Sync.entity.SavedArtistEntity;
import com.graduate.Sync.entity.UserEntity;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SavedArtistDTO {

    private String artistName;
    private String artistExternalId;
    private String artistImageUrl;

    public SavedArtistEntity toEntity(UserEntity user) {
        return new SavedArtistEntity(
                null,
                user,
                artistName,
                artistExternalId,
                artistImageUrl,
                null
        );
    }
}
