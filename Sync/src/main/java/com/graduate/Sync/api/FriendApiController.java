package com.graduate.Sync.api;

import com.graduate.Sync.entity.FriendsListEntity;
import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.FriendService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
public class FriendApiController {

    @Autowired
    private FriendService friendService;

    // 수락된 친구 목록
    @GetMapping("/api/friends")
    public List<FriendsListEntity> getFriends(HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        return friendService.getFriends(loginUser);
    }

    // 받은 친구 요청
    @GetMapping("/api/friends/requests")
    public List<FriendsListEntity> getRequests(HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        return friendService.getPendingRequests(loginUser);
    }

    // 친구 요청 발송
    @PostMapping("/api/friends/request")
    public ResponseEntity<Void> sendRequest(@RequestBody Map<String, String> body,
                                             HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        String target = body.get("target");
        boolean ok = friendService.sendRequest(loginUser, target);

        return ok
                ? ResponseEntity.status(HttpStatus.OK).build()
                : ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
    }

    // 친구 요청 수락
    @PostMapping("/api/friends/accept/{id}")
    public ResponseEntity<Void> accept(@PathVariable Long id, HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        friendService.acceptRequest(id, loginUser);
        return ResponseEntity.status(HttpStatus.OK).build();
    }

    // 친구 요청 거절
    @PostMapping("/api/friends/reject/{id}")
    public ResponseEntity<Void> reject(@PathVariable Long id, HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        friendService.rejectRequest(id, loginUser);
        return ResponseEntity.status(HttpStatus.OK).build();
    }

    // 친구가 공유(공개)한 플레이리스트 목록 (친구 관계가 아니면 빈 배열)
    @GetMapping("/api/friends/{friendUserId}/playlists")
    public ResponseEntity<List<PlaylistEntity>> getFriendPlaylists(@PathVariable Long friendUserId,
                                                                     HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(friendService.getFriendSharedPlaylists(loginUser, friendUserId));
    }
}
