package com.graduate.Sync.dto;

import com.graduate.Sync.entity.UserEntity;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UserDTO {

    private Long   id;
    private String username;
    private String email;
    private String password;       // 입력용 (평문)
    private String displayName;
    private String profileImageUrl;

    // DTO → Entity 변환 (회원가입)
    public UserEntity toEntity() {
        return new UserEntity(
                null,
                username,
                email,
                password,          // 실제 서비스에서는 BCrypt 해싱 필요
                displayName != null ? displayName : username,
                profileImageUrl,
                true,
                null,
                null,
                null
        );
    }
}
