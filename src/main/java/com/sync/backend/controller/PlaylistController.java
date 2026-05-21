package com.sync.backend.controller;

import com.sync.backend.dto.request.PlaylistGenerateRequest;
import com.sync.backend.dto.response.PlaylistGenerateResponse;
import com.sync.backend.service.PlaylistService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/playlist")
@RequiredArgsConstructor
public class PlaylistController {

    private final PlaylistService playlistService;

    @PostMapping("/generate")
    public ResponseEntity<PlaylistGenerateResponse> generate(
            @AuthenticationPrincipal Long userId,
            @RequestBody @Valid PlaylistGenerateRequest request
    ) {
        return ResponseEntity.ok(
                playlistService.generatePlaylist(userId, request.getEmotionVectorId())
        );
    }
}
