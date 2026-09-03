package com.graduate.Sync.repository;

import com.graduate.Sync.entity.OAuthAccountEntity;
import com.graduate.Sync.entity.UserEntity;
import org.springframework.data.repository.CrudRepository;

import java.util.List;
import java.util.Optional;

public interface OAuthAccountRepository extends CrudRepository<OAuthAccountEntity, Long> {

    // (provider, providerUserId) 조합으로 기존 연동 계정 조회
    Optional<OAuthAccountEntity> findByProviderAndProviderUserId(String provider, String providerUserId);

    // 특정 사용자가 연결한 소셜 계정 전체 조회 (프로필 페이지 표시용)
    List<OAuthAccountEntity> findByUser(UserEntity user);

    boolean existsByUserAndProvider(UserEntity user, String provider);
}
