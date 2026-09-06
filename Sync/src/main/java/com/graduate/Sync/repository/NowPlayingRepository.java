package com.graduate.Sync.repository;

import com.graduate.Sync.entity.NowPlayingEntity;
import org.springframework.data.repository.CrudRepository;

public interface NowPlayingRepository extends CrudRepository<NowPlayingEntity, Long> {
}
