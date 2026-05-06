package com.sync.backend.controller;

import com.sync.backend.dto.response.EmotionAnalyzeResponse;
import com.sync.backend.service.EmotionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/emotion")
@RequiredArgsConstructor
public class EmotionController {
    // 사용자 요청을 받는 API 엔드포인트 (POST /api/emotion/analyze)

    private static final java.util.Set<String> ALLOWED_IMAGE_TYPES =
            java.util.Set.of("image/jpeg", "image/png", "image/webp", "image/gif");

    private final EmotionService emotionService;

    @PostMapping(value = "/analyze", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<EmotionAnalyzeResponse> analyze(
            @AuthenticationPrincipal Long userId,
            @RequestPart(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "text", required = false) String text
    ) {
        if (file == null && (text == null || text.isBlank())) {
            return ResponseEntity.badRequest().build();
        }
        if (file != null && text != null && !text.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        if (file != null) {
            if (file.getContentType() == null || !ALLOWED_IMAGE_TYPES.contains(file.getContentType())) {
                return ResponseEntity.status(415).build();
            }
            return ResponseEntity.ok(emotionService.analyzeImage(userId, file));
        }

        return ResponseEntity.ok(emotionService.analyzeText(userId, text));
    }
}
