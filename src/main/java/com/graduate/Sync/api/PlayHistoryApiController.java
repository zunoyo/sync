package com.graduate.Sync.api;

import com.graduate.Sync.dto.PlayHistoryDTO;
import com.graduate.Sync.entity.PlayHistoryEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.PlayHistoryService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/play-history")
public class PlayHistoryApiController {

    @Autowired
    private PlayHistoryService playHistoryService;

    /* ── 재생 기록 저장 ───────────────────────────────
       트랙 재생 시 프론트에서 호출
    ─────────────────────────────────────────────────── */
    @PostMapping("")
    public ResponseEntity<PlayHistoryEntity> record(
            @RequestBody PlayHistoryDTO dto,
            HttpSession session) {

        UserEntity loginUser =
                (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        PlayHistoryEntity result =
                playHistoryService.record(dto, loginUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    /* ── 전체 재생 이력 조회 ──────────────────────────── */
    @GetMapping("")
    public ResponseEntity<List<PlayHistoryEntity>> getHistory(
            HttpSession session) {

        UserEntity loginUser =
                (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        return ResponseEntity.ok(
                playHistoryService.getHistory(loginUser));
    }

    /* ── 최근 재생 10곡 조회 (홈 화면용) ─────────────── */
    @GetMapping("/recent")
    public ResponseEntity<List<PlayHistoryEntity>> getRecent(
            HttpSession session) {

        UserEntity loginUser =
                (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        return ResponseEntity.ok(
                playHistoryService.getRecentTracks(loginUser));
    }

    /* ── 마지막으로 재생한 곡 조회 (로그인 시 플레이어 복원용) ── */
    @GetMapping("/last")
    public ResponseEntity<Object> getLast(HttpSession session) {

        UserEntity loginUser =
                (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // now_playing(사용자당 1행, 매 재생마다 갱신)을 우선 사용
        var nowPlaying = playHistoryService.getNowPlaying(loginUser);
        if (nowPlaying.isPresent()) {
            return ResponseEntity.ok(nowPlaying.get());
        }

        // now_playing이 아직 없는 계정(이번 업데이트 이전에 쌓인 이력만 있는 경우) 대비
        return playHistoryService.getLastPlayed(loginUser)
                .map(h -> ResponseEntity.ok((Object) h))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /* ── 출처별 재생 이력 조회 ────────────────────────── */
    @GetMapping("/source/{source}")
    public ResponseEntity<List<PlayHistoryEntity>> getBySource(
            @PathVariable String source,
            HttpSession session) {

        UserEntity loginUser =
                (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        return ResponseEntity.ok(
                playHistoryService.getBySource(loginUser, source));
    }
}