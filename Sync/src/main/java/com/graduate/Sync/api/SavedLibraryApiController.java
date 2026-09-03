package com.graduate.Sync.api;

import com.graduate.Sync.dto.SavedAlbumDTO;
import com.graduate.Sync.dto.SavedArtistDTO;
import com.graduate.Sync.entity.SavedAlbumEntity;
import com.graduate.Sync.entity.SavedArtistEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.SavedLibraryService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 사용자가 저장한 아티스트 / 앨범 (내 라이브러리 - 아티스트, 앨범 탭)
 * 인증은 WebConfig 의 LoginInterceptor 가 /api/library/** 경로에 적용됨
 */
@RestController
@RequestMapping("/api/library")
public class SavedLibraryApiController {

    @Autowired
    private SavedLibraryService savedLibraryService;

    /* ── 아티스트 ── */

    @GetMapping("/artists")
    public List<SavedArtistEntity> getArtists(HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        return savedLibraryService.getArtists(loginUser);
    }

    @PostMapping("/artists")
    public ResponseEntity<SavedArtistEntity> saveArtist(@RequestBody SavedArtistDTO dto,
                                                          HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        SavedArtistEntity saved = savedLibraryService.saveArtist(dto, loginUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @DeleteMapping("/artists/{id}")
    public ResponseEntity<Void> unsaveArtist(@PathVariable Long id, HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        boolean removed = savedLibraryService.unsaveArtist(id, loginUser);
        return removed ? ResponseEntity.ok().build()
                        : ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    /* ── 앨범 ── */

    @GetMapping("/albums")
    public List<SavedAlbumEntity> getAlbums(HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        return savedLibraryService.getAlbums(loginUser);
    }

    @PostMapping("/albums")
    public ResponseEntity<SavedAlbumEntity> saveAlbum(@RequestBody SavedAlbumDTO dto,
                                                        HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        SavedAlbumEntity saved = savedLibraryService.saveAlbum(dto, loginUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @DeleteMapping("/albums/{id}")
    public ResponseEntity<Void> unsaveAlbum(@PathVariable Long id, HttpSession session) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        boolean removed = savedLibraryService.unsaveAlbum(id, loginUser);
        return removed ? ResponseEntity.ok().build()
                        : ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }
}
