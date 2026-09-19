package com.graduate.Sync.api;

import com.graduate.Sync.dto.LikeToggleResultDTO;
import com.graduate.Sync.dto.PlaylistDTO;
import com.graduate.Sync.dto.PlaylistTrackDTO;
import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.PlaylistTrackEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.FriendService;
import com.graduate.Sync.service.PlaylistService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
public class PlaylistApiController {

    @Autowired
    private PlaylistService playlistService;

    @Autowired
    private FriendService friendService;

    // 열람 가능 여부: 본인 소유 또는 (공개 + 친구 관계)
    private boolean _canView(PlaylistEntity playlist, UserEntity requester) {
        if (requester == null) return false;
        if (playlist.getUser().getId().equals(requester.getId())) return true;
        return playlist.isPublic() && friendService.isFriend(requester, playlist.getUser());
    }

    // 내 플레이리스트 목록
    @GetMapping("/api/playlists")
    public List<PlaylistEntity> index(HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        return playlistService.index(loginUser);
    }

    // 플레이리스트 단건 조회 (본인 것 또는 친구가 공유한 것만 열람 가능)
    @GetMapping("/api/playlists/{id}")
    public ResponseEntity<PlaylistEntity> show(@PathVariable Long id, HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        PlaylistEntity result = playlistService.show(id);
        if (result == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        if (!_canView(result, loginUser)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(result);
    }

    // 플레이리스트 생성
    @PostMapping("/api/playlists")
    public ResponseEntity<PlaylistEntity> create(@RequestBody PlaylistDTO dto,
                                                  HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        PlaylistEntity created = playlistService.create(dto, loginUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    // 플레이리스트 삭제 (본인 소유만 가능)
    @DeleteMapping("/api/playlists/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        boolean deleted = playlistService.deleteIfOwner(id, loginUser);
        return deleted ? ResponseEntity.status(HttpStatus.OK).build()
                        : ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    // 트랙 목록 조회 (본인 것 또는 친구가 공유한 것만 열람 가능)
    @GetMapping("/api/playlists/{id}/tracks")
    public ResponseEntity<List<PlaylistTrackEntity>> getTracks(@PathVariable Long id,
                                                                 HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        PlaylistEntity playlist = playlistService.show(id);
        if (playlist == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        if (!_canView(playlist, loginUser)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(playlistService.getTracks(playlist));
    }

    // 트랙 추가 (본인 소유 플레이리스트만 가능 — 친구 플레이리스트 곡을 저장하려면
    // 내 플레이리스트 id로 이 API를 호출해야 함, PlaylistPicker가 이 방식으로 동작)
    @PostMapping("/api/playlists/{id}/tracks")
    public ResponseEntity<PlaylistTrackEntity> addTrack(@PathVariable Long id,
                                                         @RequestBody PlaylistTrackDTO dto,
                                                         HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        PlaylistEntity playlist = playlistService.show(id);
        if (playlist == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        if (!playlist.getUser().getId().equals(loginUser.getId()))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        PlaylistTrackEntity track = playlistService.addTrack(dto, playlist);
        // 이미 추가된 곡이면 addTrack()이 null을 반환 → 409로 명확히 구분
        if (track == null) return ResponseEntity.status(HttpStatus.CONFLICT).build();
        return ResponseEntity.status(HttpStatus.CREATED).body(track);
    }

    // 트랙 삭제 (본인 소유 플레이리스트의 트랙만 가능)
    @DeleteMapping("/api/playlists/tracks/{trackId}")
    public ResponseEntity<Void> deleteTrack(@PathVariable Long trackId, HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        boolean deleted = playlistService.deleteTrackIfOwner(trackId, loginUser);
        return deleted ? ResponseEntity.status(HttpStatus.OK).build()
                        : ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    // 친구 공유(공개) 여부 토글 — 플레이리스트 상세 화면의 "공유" 버튼
    @PatchMapping("/api/playlists/{id}/visibility")
    public ResponseEntity<PlaylistEntity> updateVisibility(@PathVariable Long id,
                                                            @RequestBody Map<String, Boolean> body,
                                                            HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        Boolean isPublic = body.get("public");
        if (isPublic == null) return ResponseEntity.badRequest().build();
        PlaylistEntity updated = playlistService.updateVisibility(id, isPublic, loginUser);
        if (updated == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(updated);
    }

    /* ── 좋아요(하트) ──
       "/api/playlists/liked/..." 는 리터럴 경로라 "/api/playlists/{id}/..." 보다
       우선 매칭되므로 위의 {id} 라우트와 충돌하지 않는다. */

    // 좋아요 토글 (없으면 "좋아요 표시한 곡"에 추가, 있으면 제거)
    @PostMapping("/api/playlists/liked/toggle")
    public ResponseEntity<LikeToggleResultDTO> toggleLike(@RequestBody PlaylistTrackDTO dto,
                                                            HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(playlistService.toggleLike(dto, loginUser));
    }

    // 좋아요 표시한 곡 목록 (없으면 빈 배열 — 조회만으로 플레이리스트를 만들지 않음)
    @GetMapping("/api/playlists/liked/tracks")
    public ResponseEntity<List<PlaylistTrackEntity>> getLikedTracks(HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        PlaylistEntity liked = playlistService
                .getBySource(loginUser, PlaylistService.LIKED_SONGS_SOURCE)
                .stream().findFirst().orElse(null);
        if (liked == null) return ResponseEntity.ok(List.of());
        return ResponseEntity.ok(playlistService.getTracks(liked));
    }
}
