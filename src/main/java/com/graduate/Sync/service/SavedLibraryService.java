package com.graduate.Sync.service;

import com.graduate.Sync.dto.SavedAlbumDTO;
import com.graduate.Sync.dto.SavedArtistDTO;
import com.graduate.Sync.entity.SavedAlbumEntity;
import com.graduate.Sync.entity.SavedArtistEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.repository.SavedAlbumRepository;
import com.graduate.Sync.repository.SavedArtistRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class SavedLibraryService {

    @Autowired
    private SavedArtistRepository savedArtistRepository;

    @Autowired
    private SavedAlbumRepository savedAlbumRepository;

    /* ── 아티스트 ── */

    public List<SavedArtistEntity> getArtists(UserEntity user) {
        return savedArtistRepository.findByUserOrderBySavedAtDesc(user);
    }

    // 이미 저장돼 있으면 기존 것을 그대로 반환 (중복 저장 방지)
    public SavedArtistEntity saveArtist(SavedArtistDTO dto, UserEntity user) {
        Optional<SavedArtistEntity> existing =
                savedArtistRepository.findByUserAndArtistName(user, dto.getArtistName());
        if (existing.isPresent()) return existing.get();
        return savedArtistRepository.save(dto.toEntity(user));
    }

    // 본인 소유 항목만 삭제 (소유권 확인)
    @Transactional
    public boolean unsaveArtist(Long id, UserEntity user) {
        Optional<SavedArtistEntity> target = savedArtistRepository.findById(id);
        if (target.isEmpty() || !target.get().getUser().getId().equals(user.getId())) {
            return false;
        }
        savedArtistRepository.deleteById(id);
        return true;
    }

    /* ── 앨범 ── */

    public List<SavedAlbumEntity> getAlbums(UserEntity user) {
        return savedAlbumRepository.findByUserOrderBySavedAtDesc(user);
    }

    public SavedAlbumEntity saveAlbum(SavedAlbumDTO dto, UserEntity user) {
        Optional<SavedAlbumEntity> existing =
                savedAlbumRepository.findByUserAndAlbumExternalId(user, dto.getAlbumExternalId());
        if (existing.isPresent()) return existing.get();
        return savedAlbumRepository.save(dto.toEntity(user));
    }

    @Transactional
    public boolean unsaveAlbum(Long id, UserEntity user) {
        Optional<SavedAlbumEntity> target = savedAlbumRepository.findById(id);
        if (target.isEmpty() || !target.get().getUser().getId().equals(user.getId())) {
            return false;
        }
        savedAlbumRepository.deleteById(id);
        return true;
    }
}
