package com.graduate.Sync.controller;

import com.graduate.Sync.dto.UserDTO;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.PlaylistService;
import com.graduate.Sync.service.UserService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.ui.Model;

@RequestMapping("/profile")
@Controller
public class ProfileController {

    @Autowired private UserService userService;
    @Autowired private PlaylistService playlistService;

    @GetMapping("")
    public String profile(HttpSession session, Model model) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");

        String name     = loginUser.getDisplayName() != null
                ? loginUser.getDisplayName() : loginUser.getUsername();
        String initials = name.substring(0, 1).toUpperCase();

        model.addAttribute("loginUser", loginUser);
        model.addAttribute("initials",  initials);
        return "profile/settings";
    }

    @PostMapping("/update")
    public String update(UserDTO dto, HttpSession session, RedirectAttributes ra) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");

        // 이메일을 바꿨는데 다른 유저가 이미 쓰고 있는 경우 차단
        if (!loginUser.getEmail().equals(dto.getEmail())
                && userService.existsByEmail(dto.getEmail())) {
            ra.addFlashAttribute("errorMsg", "이미 사용 중인 이메일이에요.");
            return "redirect:/profile";
        }

        UserEntity updated = userService.update(loginUser.getId(), dto);
        if (updated != null) {
            session.setAttribute("loginUser", updated);
            ra.addFlashAttribute("successMsg", "정보가 수정됐어요.");
        } else {
            ra.addFlashAttribute("errorMsg", "수정에 실패했어요.");
        }
        return "redirect:/profile";   // ← /profile로 변경
    }
}
