package com.sync.backend.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class PlaylistGenerateRequest {

    @NotNull(message = "emotionVectorId는 필수입니다.")
    private Long emotionVectorId;
}
