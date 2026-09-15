package com.graduate.Sync.service;

import com.graduate.Sync.dto.ClipResponseDTO;
import com.graduate.Sync.dto.EmotionVectorDTO;
import com.graduate.Sync.entity.EmotionVectorEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.repository.EmotionVectorRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class EmotionVectorService {

    @Autowired
    private EmotionVectorRepository emotionVectorRepository;

    @Autowired
    private RestTemplate restTemplate;

    @Value("${clip.server.url:http://localhost:8000}")
    private String clipServerUrl;

    /* ── CLIP 분석 + DB 저장 ─────────────────────── */
    public EmotionVectorEntity analyze(EmotionVectorDTO dto, UserEntity user) {
        // 1. Python CLIP 서버 호출
        ClipResponseDTO clip = callClipServer(dto);
        if (clip == null) return null;

        // 2. 응답을 DTO에 병합
        dto.setPrimaryEmotion(clip.getPrimaryEmotion());
        dto.setSecondaryEmotion(clip.getSecondaryEmotion());
        dto.setValence(clip.getValence());
        dto.setArousal(clip.getArousal());
        dto.setConfidence(clip.getConfidence());
        dto.setClipEmbedding(clip.getClipEmbedding());
        dto.setLastfmTags(
            clip.getLastfmTags() != null
                ? clip.getLastfmTags()
                : "[\"pop\", \"music\"]"
        );
        dto.setInputSummary(clip.getInputSummary());

        // 3. DB 저장
        return emotionVectorRepository.save(dto.toEntity(user));
    }

    /* ── Python CLIP 서버 호출 ────────────────────── */
    public ClipResponseDTO callClipServer(EmotionVectorDTO dto) {
        try {
            Map<String, Object> request = new HashMap<>();
            request.put("input_type", dto.getInputType());
            request.put("input_text", dto.getInputText());
            request.put("image_url",  dto.getImageUrl());

            ResponseEntity<ClipResponseDTO> response = restTemplate.postForEntity(
                clipServerUrl + "/analyze",
                request,
                ClipResponseDTO.class
            );
            return response.getBody();
        } catch (Exception e) {
            System.err.println("[CLIP] 서버 호출 실패: " + e.getMessage());
            return null;
        }
    }

    /* ── 조회 ─────────────────────────────────────── */
    public List<EmotionVectorEntity> getHistory(UserEntity user) {
        return emotionVectorRepository.findByUserOrderByCreatedAtDesc(user);
    }

    public EmotionVectorEntity show(Long id) {
        return emotionVectorRepository.findById(id).orElse(null);
    }
}
