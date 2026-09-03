package com.graduate.Sync.repository;

import com.graduate.Sync.entity.SavedAlbumEntity;
import com.graduate.Sync.entity.UserEntity;
import org.springframework.data.repository.CrudRepository;

import java.util.List;
import java.util.Optional;

public interface SavedAlbumRepository extends CrudRepository<SavedAlbumEntity, Long> {

    List<SavedAlbumEntity> findByUserOrderBySavedAtDesc(UserEntity user);

    Optional<SavedAlbumEntity> findByUserAndAlbumExternalId(UserEntity user, String albumExternalId);

    boolean existsByUserAndAlbumExternalId(UserEntity user, String albumExternalId);
}
