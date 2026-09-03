package com.graduate.Sync.service;

import com.graduate.Sync.entity.FriendsListEntity;
import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.repository.FriendsListRepository;
import com.graduate.Sync.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class FriendService {

    @Autowired
    private FriendsListRepository friendsListRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PlaylistService playlistService;

    // 수락된 친구 목록
    // 응답으로 friend(UserEntity)의 이름/아바타 정보가 필요하므로, open-in-view=false 환경에서
    // 세션이 열려있는 동안 지연 로딩 필드를 미리 초기화해둔다 (안 그러면 JSON 직렬화 시점엔
    // 세션이 이미 닫혀 있어 LazyInitializationException 발생).
    @Transactional(readOnly = true)
    public List<FriendsListEntity> getFriends(UserEntity user) {
        List<FriendsListEntity> list = friendsListRepository.findByUserAndStatus(user, "ACCEPTED");
        for (FriendsListEntity f : list) {
            f.getFriend().getUsername();
            f.getFriend().getDisplayName();
            f.getFriend().getProfileImageUrl();
        }
        return list;
    }

    // 받은 친구 요청 (PENDING) — 요청 보낸 사람(user) 정보 필요, 위와 동일한 이유로 초기화
    @Transactional(readOnly = true)
    public List<FriendsListEntity> getPendingRequests(UserEntity user) {
        List<FriendsListEntity> list = friendsListRepository.findByFriendAndStatus(user, "PENDING");
        for (FriendsListEntity f : list) {
            f.getUser().getUsername();
            f.getUser().getDisplayName();
            f.getUser().getProfileImageUrl();
        }
        return list;
    }

    // 친구 요청 발송
    public boolean sendRequest(UserEntity from, String targetEmailOrUsername) {
        UserEntity target = userRepository.findByEmail(targetEmailOrUsername)
                .or(() -> userRepository.findByUsername(targetEmailOrUsername))
                .orElse(null);

        if (target == null || target.getId().equals(from.getId())) return false;

        // 이미 요청이 있으면 중복 방지
        if (friendsListRepository.findByUserAndFriend(from, target).isPresent()) return false;

        FriendsListEntity request = new FriendsListEntity(null, from, target, "PENDING", null, null);
        friendsListRepository.save(request);
        return true;
    }

    // 친구 요청 수락
    @Transactional
    public void acceptRequest(Long requestId, UserEntity loginUser) {
        FriendsListEntity req = friendsListRepository.findById(requestId).orElse(null);
        if (req == null || !req.getFriend().getId().equals(loginUser.getId())) return;

        req.accept();
        friendsListRepository.save(req);

        // 양방향 친구 관계 생성
        FriendsListEntity reverse = new FriendsListEntity(null, loginUser, req.getUser(), "ACCEPTED", null, null);
        friendsListRepository.save(reverse);
    }

    // 친구 요청 거절
    public void rejectRequest(Long requestId, UserEntity loginUser) {
        FriendsListEntity req = friendsListRepository.findById(requestId).orElse(null);
        if (req == null || !req.getFriend().getId().equals(loginUser.getId())) return;

        req.reject();
        friendsListRepository.save(req);
    }

    // 두 사용자가 친구(ACCEPTED)인지 확인 — 플레이리스트 열람 권한 체크에 사용
    public boolean isFriend(UserEntity user, UserEntity other) {
        if (user == null || other == null) return false;
        return friendsListRepository.findByUserAndFriend(user, other)
                .map(f -> "ACCEPTED".equals(f.getStatus()))
                .orElse(false);
    }

    // 친구가 공유(공개)한 플레이리스트 목록 — 친구 관계 확인 후에만 반환
    public List<PlaylistEntity> getFriendSharedPlaylists(UserEntity loginUser, Long friendUserId) {
        UserEntity friend = userRepository.findById(friendUserId).orElse(null);
        if (friend == null || !isFriend(loginUser, friend)) return List.of();
        return playlistService.getPublicPlaylists(friend);
    }
}
