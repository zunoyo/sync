package com.graduate.Sync.controller;

import com.graduate.Sync.dto.PlaylistDTO;
import com.graduate.Sync.entity.PlaylistEntity;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.PlaylistService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/** 플레이리스트 페이지는 SPA가 처리. CRUD만 서버가 처리 */
@RequestMapping("/playlists")
@Controller
public class PlaylistController {

    @Autowired private PlaylistService playlistService;

    @GetMapping("")
    public String list() { return "redirect:/"; }

    @GetMapping("/{id}")
    public String detail() { return "redirect:/"; }

    @PostMapping("/create")
    public String create(PlaylistDTO dto, HttpSession session, RedirectAttributes ra) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        PlaylistEntity created = playlistService.create(dto, loginUser);
        ra.addFlashAttribute("successMsg", "'" + created.getPlaylistName() + "' 플레이리스트가 생성됐어요!");
        return "redirect:/";
    }

    @GetMapping("/{id}/delete")
    public String delete(@PathVariable Long id, RedirectAttributes ra) {
        playlistService.delete(id);
        ra.addFlashAttribute("successMsg", "플레이리스트가 삭제됐어요.");
        return "redirect:/";
    }
}
