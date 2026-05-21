package com.sync.backend.service;

import com.sync.backend.domain.EmotionVector;
import com.sync.backend.dto.response.EmotionAnalyzeResponse;
import com.sync.backend.dto.response.FastApiEmotionResponse;
import com.sync.backend.repository.EmotionVectorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmotionService {
 // FastAPI 호출 + DB 저장 핵심 비즈니스 로직
    private final RestTemplate restTemplate;
    private final EmotionVectorRepository emotionVectorRepository;

    @Value("${fastapi.base-url}")
    private String fastApiBaseUrl;

    @Transactional
    public EmotionAnalyzeResponse analyzeText(Long userId, String text) {
        FastApiEmotionResponse fastApiResponse = callFastApiWithText(text);
        EmotionVector saved = saveEmotionVector(userId, fastApiResponse, "text", text);
        return EmotionAnalyzeResponse.from(saved);
    }

    @Transactional
    public EmotionAnalyzeResponse analyzeImage(Long userId, MultipartFile file) {
        FastApiEmotionResponse fastApiResponse = callFastApiWithImage(file);
        EmotionVector saved = saveEmotionVector(userId, fastApiResponse, "image", null);
        return EmotionAnalyzeResponse.from(saved);
    }

    private FastApiEmotionResponse callFastApiWithText(String text) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("text", text);

        HttpEntity<MultiValueMap<String, Object>> request = new HttpEntity<>(body, headers);
        return sendToFastApi(request);
    }

    private FastApiEmotionResponse callFastApiWithImage(MultipartFile file) {
        try {
            byte[] bytes = file.getBytes();
            String originalFilename = file.getOriginalFilename() != null
                    ? file.getOriginalFilename() : "image";

            ByteArrayResource resource = new ByteArrayResource(bytes) {
                @Override
                public String getFilename() {
                    return originalFilename;
                }
            };

            HttpHeaders fileHeaders = new HttpHeaders();
            fileHeaders.setContentType(MediaType.parseMediaType(
                    file.getContentType() != null ? file.getContentType() : MediaType.IMAGE_JPEG_VALUE
            ));

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("file", new HttpEntity<>(resource, fileHeaders));

            HttpEntity<MultiValueMap<String, Object>> request = new HttpEntity<>(body, headers);
            return sendToFastApi(request);

        } catch (IOException e) {
            throw new IllegalStateException("이미지 파일 읽기 실패", e);
        }
    }

    private FastApiEmotionResponse sendToFastApi(HttpEntity<MultiValueMap<String, Object>> request) {
        String url = fastApiBaseUrl + "/api/v1/analyze";
        try {
            ResponseEntity<FastApiEmotionResponse> response =
                    restTemplate.postForEntity(url, request, FastApiEmotionResponse.class);

            if (response.getBody() == null) {
                throw new IllegalStateException("FastAPI 응답이 비어있습니다");
            }
            return response.getBody();

        } catch (RestClientException e) {
            log.error("FastAPI 호출 실패: {}", e.getMessage());
            throw new IllegalStateException("감성 분석 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.", e);
        }
    }

    private EmotionVector saveEmotionVector(Long userId, FastApiEmotionResponse response,
                                             String inputType, String inputText) {
        EmotionVector vector = EmotionVector.builder()
                .userId(userId)
                .valence(response.getValence())
                .arousal(response.getArousal())
                .lastfmTags(response.getLastfmTags())
                .inputType(inputType)
                .inputText(inputText)
                .build();

        return emotionVectorRepository.save(vector);
    }
}
