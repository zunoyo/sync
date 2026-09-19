package com.graduate.Sync.repository;

import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.UserEntity;
import org.springframework.data.repository.CrudRepository;

import java.util.List;
import java.util.Optional;

public interface PlaylistRepository extends CrudRepository<PlaylistEntity, Long> {

    // 사용자의 전체 플레이리스트 조회
    List<PlaylistEntity> findByUser(UserEntity user);

    // 사용자의 플레이리스트 최신순 조회
    List<PlaylistEntity> findByUserOrderByCreatedAtDesc(UserEntity user);

    // 문자열 ID로 단건 조회
    Optional<PlaylistEntity> findByPlaylistId(String playlistId);

    // source 별 조회
    // 사용 예) findByUserAndSource(user, "user_created")
    //         findByUserAndSource(user, "ai_recommended")
    List<PlaylistEntity> findByUserAndSource(UserEntity user, String source);

    // source 별 최신순 조회
    List<PlaylistEntity> findByUserAndSourceOrderByCreatedAtDesc(
            UserEntity user, String source);

    // 좋아요 표시한 곡 플레이리스트 단건 조회 (source = "liked_songs", 사용자당 1개)
    Optional<PlaylistEntity> findFirstByUserAndSource(UserEntity user, String source);

    // 친구에게 공유(공개)된 플레이리스트만 최신순 조회
    List<PlaylistEntity> findByUserAndIsPublicTrueOrderByCreatedAtDesc(UserEntity user);
}
