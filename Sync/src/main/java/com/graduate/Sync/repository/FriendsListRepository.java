package com.graduate.Sync.repository;

import com.graduate.Sync.entity.FriendsListEntity;
import com.graduate.Sync.entity.UserEntity;
import org.springframework.data.repository.CrudRepository;

import java.util.List;
import java.util.Optional;

public interface FriendsListRepository extends CrudRepository<FriendsListEntity, Long> {

    // 수락된 친구 목록
    List<FriendsListEntity> findByUserAndStatus(UserEntity user, String status);

    // 받은 친구 요청 (PENDING)
    List<FriendsListEntity> findByFriendAndStatus(UserEntity friend, String status);

    Optional<FriendsListEntity> findByUserAndFriend(UserEntity user, UserEntity friend);
}
