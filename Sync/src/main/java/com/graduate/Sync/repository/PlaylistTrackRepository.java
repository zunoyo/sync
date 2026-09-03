package com.graduate.Sync.repository;

import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.PlaylistTrackEntity;
import org.springframework.data.repository.CrudRepository;

import java.util.List;
import java.util.Optional;

public interface PlaylistTrackRepository
        extends CrudRepository<PlaylistTrackEntity, Long> {

    // 플레이리스트 트랙 목록 조회 (순서 오름차순)
    List<PlaylistTrackEntity> findByPlaylistOrderByOrderIndex(PlaylistEntity playlist);

    // 플레이리스트 트랙 목록 조회 (순서 내림차순)
    // 마지막 orderIndex 확인 후 새 트랙 순서 자동 계산 시 사용
    List<PlaylistTrackEntity> findByPlaylistOrderByOrderIndexDesc(PlaylistEntity playlist);

    //  Spotify 트랙 ID로 단건 조회
    Optional<PlaylistTrackEntity> findBySpotifyTrackId(String spotifyTrackId);

    //  특정 플레이리스트 내 중복 트랙 확인 (Spotify ID 기준)
    // 사용 예) 이미 추가된 트랙인지 확인 후 중복 추가 방지
    boolean existsByPlaylistAndSpotifyTrackId(PlaylistEntity playlist, String spotifyTrackId);

    //  특정 플레이리스트 내 중복 트랙 확인 (곡명+아티스트명 기준)
    // spotifyTrackId 가 없는 트랙(iTunes 검색 결과 등)의 중복 추가 방지용
    boolean existsByPlaylistAndLastfmTrackNameAndLastfmArtistName(
            PlaylistEntity playlist, String lastfmTrackName, String lastfmArtistName);

    //  특정 플레이리스트 내에서 트랙 단건 조회 (좋아요 토글 시 이미 있으면 찾아서 제거)
    Optional<PlaylistTrackEntity> findByPlaylistAndSpotifyTrackId(
            PlaylistEntity playlist, String spotifyTrackId);

    // 플레이리스트 전체 트랙 삭제
    // 플레이리스트 삭제 시 트랙도 함께 삭제
    void deleteByPlaylist(PlaylistEntity playlist);
}