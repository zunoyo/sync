package com.graduate.Sync.repository;

import com.graduate.Sync.entity.SavedArtistEntity;
import com.graduate.Sync.entity.UserEntity;
import org.springframework.data.repository.CrudRepository;

import java.util.List;
import java.util.Optional;

public interface SavedArtistRepository extends CrudRepository<SavedArtistEntity, Long> {

    List<SavedArtistEntity> findByUserOrderBySavedAtDesc(UserEntity user);

    Optional<SavedArtistEntity> findByUserAndArtistName(UserEntity user, String artistName);

    boolean existsByUserAndArtistName(UserEntity user, String artistName);
}
