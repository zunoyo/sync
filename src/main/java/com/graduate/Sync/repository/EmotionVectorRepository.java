package com.graduate.Sync.repository;

import com.graduate.Sync.entity.EmotionVectorEntity;
import com.graduate.Sync.entity.UserEntity;
import org.springframework.data.repository.CrudRepository;
import java.util.List;

public interface EmotionVectorRepository
        extends CrudRepository<EmotionVectorEntity, Long> {

    List<EmotionVectorEntity> findByUserOrderByCreatedAtDesc(UserEntity user);

    List<EmotionVectorEntity> findTop5ByUserOrderByCreatedAtDesc(UserEntity user);
}
