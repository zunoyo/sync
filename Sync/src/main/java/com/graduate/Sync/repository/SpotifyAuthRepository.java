package com.graduate.Sync.repository;

import com.graduate.Sync.entity.SpotifyAuthEntity;
import com.graduate.Sync.entity.UserEntity;
import org.springframework.data.repository.CrudRepository;

import java.util.Optional;

public interface SpotifyAuthRepository
        extends CrudRepository<SpotifyAuthEntity, Long> {

    // 사용자의 Spotify 인증 정보 조회
    Optional<SpotifyAuthEntity> findByUser(UserEntity user);

    // 사용자 ID로 Spotify 인증 정보 조회
    Optional<SpotifyAuthEntity> findByUserId(Long userId);

    // Spotify 연동 여부 확인
    boolean existsByUser(UserEntity user);
}