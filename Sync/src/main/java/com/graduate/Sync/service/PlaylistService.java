package com.graduate.Sync.service;

import com.graduate.Sync.dto.LikeToggleResultDTO;
import com.graduate.Sync.dto.PlaylistDTO;
import com.graduate.Sync.dto.PlaylistTrackDTO;
import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.PlaylistTrackEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.repository.PlaylistRepository;
import com.graduate.Sync.repository.PlaylistTrackRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class PlaylistService {

    @Autowired
    private PlaylistRepository playlistRepository;

    @Autowired
    private PlaylistTrackRepository playlistTrackRepository;

    // 사용자 플레이리스트 전체 조회 최신순
    public List<PlaylistEntity> index(UserEntity user) {
        return playlistRepository.findByUserOrderByCreatedAtDesc(user);
    }

    // 단건 조회
    public PlaylistEntity show(Long id) {
        return playlistRepository.findById(id).orElse(null);
    }

    // 플레이리스트 생성
    public PlaylistEntity create(PlaylistDTO dto, UserEntity user) {
        PlaylistEntity entity = dto.toEntity(user);
        return playlistRepository.save(entity);
    }

    // 플레이리스트 삭제
    @Transactional
    public void delete(Long id) {
        PlaylistEntity target = playlistRepository.findById(id).orElse(null);
        if (target != null) {
            playlistTrackRepository.deleteByPlaylist(target);
            playlistRepository.delete(target);
        }
    }

    // 트랙 목록 조회 (순서 정렬)
    public List<PlaylistTrackEntity> getTracks(PlaylistEntity playlist) {
        return playlistTrackRepository.findByPlaylistOrderByOrderIndex(playlist);
    }

    // 트랙 추가
    //  중복 확인 + orderIndex 자동 계산
    public PlaylistTrackEntity addTrack(PlaylistTrackDTO dto,
                                        PlaylistEntity playlist) {
        // 중복 트랙 확인
        // spotifyTrackId 가 있으면 그 값으로, 없으면(iTunes 검색 결과 등) 곡명+아티스트명으로 확인
        boolean isDuplicate = (dto.getSpotifyTrackId() != null && !dto.getSpotifyTrackId().isBlank())
                ? playlistTrackRepository.existsByPlaylistAndSpotifyTrackId(playlist, dto.getSpotifyTrackId())
                : playlistTrackRepository.existsByPlaylistAndLastfmTrackNameAndLastfmArtistName(
                        playlist, dto.getLastfmTrackName(), dto.getLastfmArtistName());

        if (isDuplicate) {
            return null;  // 이미 추가된 트랙
        }

        // 마지막 orderIndex 확인 후 다음 순서 자동 계산
        List<PlaylistTrackEntity> tracks = playlistTrackRepository.findByPlaylistOrderByOrderIndexDesc(playlist);

        int nextOrder = tracks.isEmpty() ? 1 : tracks.get(0).getOrderIndex() + 1;

        dto.setOrderIndex(nextOrder);
        PlaylistTrackEntity entity = dto.toEntity(playlist);

        return playlistTrackRepository.save(entity);
    }

    // 트랙 삭제
    public void deleteTrack(Long trackId) {
        playlistTrackRepository.deleteById(trackId);
    }

    // source 별 플레이리스트 조회
    public List<PlaylistEntity> getBySource(UserEntity user, String source) {
        return playlistRepository.findByUserAndSourceOrderByCreatedAtDesc(user, source);
    }

    /* ── 좋아요(하트) 토글 ──
       "좋아요 표시한 곡" 플레이리스트(source="liked_songs")가 없으면 만들고,
       이미 들어있는 트랙이면 제거, 없으면 추가한다. */

    public static final String LIKED_SONGS_SOURCE = "liked_songs";
    public static final String LIKED_SONGS_NAME   = "좋아요 표시한 곡";

    @Transactional
    public PlaylistEntity getOrCreateLikedPlaylist(UserEntity user) {
        return playlistRepository.findFirstByUserAndSource(user, LIKED_SONGS_SOURCE)
                .orElseGet(() -> {
                    PlaylistEntity liked = new PlaylistEntity(
                            null, null, LIKED_SONGS_NAME, false,
                            LIKED_SONGS_SOURCE, "💚", "grad-1",
                            user, null, null
                    );
                    return playlistRepository.save(liked);
                });
    }

    @Transactional
    public LikeToggleResultDTO toggleLike(PlaylistTrackDTO dto, UserEntity user) {
        PlaylistEntity liked = getOrCreateLikedPlaylist(user);

        var existing = playlistTrackRepository
                .findByPlaylistAndSpotifyTrackId(liked, dto.getSpotifyTrackId());

        boolean nowLiked;
        if (existing.isPresent()) {
            playlistTrackRepository.delete(existing.get());
            nowLiked = false;
        } else {
            addTrack(dto, liked);   // 이 시점엔 중복 아님이 보장됨
            nowLiked = true;
        }
        return new LikeToggleResultDTO(nowLiked, liked.getId(), liked.getPlaylistName());
    }

    /* ── 친구 공유(공개) ── */

    // 소유자 확인 후 공개 여부 토글. 소유자가 아니면 null 반환
    @Transactional
    public PlaylistEntity updateVisibility(Long id, boolean isPublic, UserEntity user) {
        PlaylistEntity pl = playlistRepository.findById(id).orElse(null);
        if (pl == null || !pl.getUser().getId().equals(user.getId())) return null;
        pl.updateVisibility(isPublic);
        return playlistRepository.save(pl);
    }

    // 특정 사용자가 친구에게 공유(공개)한 플레이리스트 목록
    public List<PlaylistEntity> getPublicPlaylists(UserEntity user) {
        return playlistRepository.findByUserAndIsPublicTrueOrderByCreatedAtDesc(user);
    }

    /* ── 소유권 확인이 필요한 변경 작업 (API 컨트롤러에서 사용) ── */

    // 소유자 확인 후 삭제. 소유자가 아니면 false
    @Transactional
    public boolean deleteIfOwner(Long id, UserEntity user) {
        PlaylistEntity target = playlistRepository.findById(id).orElse(null);
        if (target == null || !target.getUser().getId().equals(user.getId())) return false;
        playlistTrackRepository.deleteByPlaylist(target);
        playlistRepository.delete(target);
        return true;
    }

    // 소유자 확인 후 트랙 삭제. 소유자가 아니면 false
    @Transactional
    public boolean deleteTrackIfOwner(Long trackId, UserEntity user) {
        return playlistTrackRepository.findById(trackId)
                .filter(t -> t.getPlaylist().getUser().getId().equals(user.getId()))
                .map(t -> { playlistTrackRepository.delete(t); return true; })
                .orElse(false);
    }
}
