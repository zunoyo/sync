package com.graduate.Sync.service;

import com.graduate.Sync.dto.UserDTO;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    /* ── 로그인 ── */
    public UserEntity login(String email, String password) {
        UserEntity user = userRepository.findByEmail(email).orElse(null);
        if (user == null || !passwordEncoder.matches(password, user.getPasswordHash()))
            return null;
        updateLastActiveAt(user.getId());
        return userRepository.findById(user.getId()).orElse(null);
    }

    /* ── 회원가입 ── */
    public UserEntity signup(UserDTO dto) {
        if (userRepository.existsByEmail(dto.getEmail()))    return null;
        if (userRepository.existsByUsername(dto.getUsername())) return null;
        dto.setPassword(passwordEncoder.encode(dto.getPassword()));
        return userRepository.save(dto.toEntity());
    }

    /* ── 단건 조회 ── */
    public UserEntity show(Long id) {
        return userRepository.findById(id).orElse(null);
    }

    /* ── 기본 정보 업데이트 (이름·사용자명·이메일) ──
       반환값: 업데이트된 UserEntity, null = 이메일/사용자명 중복
    ── */
    public UserEntity updateProfile(Long id, UserDTO dto) {
        UserEntity user = userRepository.findById(id).orElse(null);
        if (user == null) return null;

        // 이메일 중복 체크 (자신 제외)
        if (dto.getEmail() != null && !dto.getEmail().isBlank()
                && !dto.getEmail().equals(user.getEmail())) {
            if (userRepository.existsByEmail(dto.getEmail())) return null;
            user.setEmail(dto.getEmail());
        }

        // 사용자명 중복 체크 (자신 제외)
        if (dto.getUsername() != null && !dto.getUsername().isBlank()
                && !dto.getUsername().equals(user.getUsername())) {
            if (userRepository.existsByUsername(dto.getUsername())) return null;
            user.setUsername(dto.getUsername());
        }

        if (dto.getDisplayName() != null && !dto.getDisplayName().isBlank())
            user.setDisplayName(dto.getDisplayName());

        if (dto.getProfileImageUrl() != null)
            user.setProfileImageUrl(dto.getProfileImageUrl());

        return userRepository.save(user);
    }

    /* ── 비밀번호 변경 ──
       반환값: "ok" = 성공, 그 외 = 오류 메시지
    ── */
    public String changePassword(Long id, String currentPw, String newPw) {
        UserEntity user = userRepository.findById(id).orElse(null);
        if (user == null) return "사용자를 찾을 수 없어요.";

        if (!passwordEncoder.matches(currentPw, user.getPasswordHash()))
            return "현재 비밀번호가 올바르지 않아요.";

        if (newPw == null || newPw.length() < 8)
            return "새 비밀번호는 8자 이상이어야 해요.";

        user.setPasswordHash(passwordEncoder.encode(newPw));
        userRepository.save(user);
        return "ok";
    }

    /* ── 계정 비활성화 ── */
    public void deactivateAccount(Long id) {
        UserEntity user = userRepository.findById(id).orElse(null);
        if (user == null) return;
        user.setIsActive(false);
        userRepository.save(user);
    }

    /* ── 계정 삭제 ── */
    public void deleteAccount(Long id) {
        userRepository.deleteById(id);
    }

    /* ── 기존 patch 기반 수정 (호환 유지) ── */
    public UserEntity update(Long id, UserDTO dto) {
        UserEntity target = userRepository.findById(id).orElse(null);
        if (target == null) return null;

        String hashedPw = null;
        if (dto.getPassword() != null && !dto.getPassword().isBlank())
            hashedPw = passwordEncoder.encode(dto.getPassword());

        UserEntity updateData = new UserEntity(
                null, null, dto.getEmail(), hashedPw,
                dto.getDisplayName(), dto.getProfileImageUrl(),
                true, null, null, null
        );
        target.patch(updateData);
        return userRepository.save(target);
    }

    public void updateLastActiveAt(Long id) {
        UserEntity user = userRepository.findById(id).orElse(null);
        if (user == null) return;
        user.updateLastActiveAt();
        userRepository.save(user);
    }

    public boolean existsByEmail(String email)    { return userRepository.existsByEmail(email); }
    public boolean existsByUsername(String u)     { return userRepository.existsByUsername(u); }
}
