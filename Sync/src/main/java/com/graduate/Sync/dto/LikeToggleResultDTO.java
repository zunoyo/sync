package com.graduate.Sync.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class LikeToggleResultDTO {
    private boolean liked;
    private Long    playlistId;      // 좋아요 표시한 곡 플레이리스트의 DB id
    private String  playlistName;    // 프론트에서 "OO에 저장했어요" 안내용
}
