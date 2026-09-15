package com.graduate.Sync.controller;

import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.PlaylistService;
import jakarta.servlet.http.HttpSession;
import org.springframework.ui.Model;
import java.util.List;

/** 공통 Model 데이터 세팅 헬퍼 */
public abstract class BaseController {

    protected void addCommon(Model model, HttpSession session, PlaylistService playlistService, String currentPage) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        if (loginUser == null) return;

        String un = loginUser.getUsername() != null ? loginUser.getUsername() : "SW";
        String initials = un.substring(0, Math.min(2, un.length())).toUpperCase();

        List<PlaylistEntity> userPlaylists = playlistService.index(loginUser);

        model.addAttribute("loginUser",    loginUser);
        model.addAttribute("initials",     initials);
        model.addAttribute("userPlaylists", userPlaylists);
        model.addAttribute("currentPage",  currentPage);
    }
}
