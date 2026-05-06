package com.sync.backend.repository;

import com.sync.backend.domain.EmotionVector;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EmotionVectorRepository extends JpaRepository<EmotionVector, Long> {
    //DB에서 감성 분석 결과를 저장하고 조회하는 인터페이스
    List<EmotionVector> findByUserIdOrderByCreatedAtDesc(Long userId);
}
