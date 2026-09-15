package com.graduate.Sync.controller;

import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.FriendService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/** 친구 페이지는 SPA가 처리. 친구 수락/거절만 서버가 처리 */
@RequestMapping("/friends")
@Controller
public class FriendController {

    @Autowired private FriendService friendService;

    @GetMapping("")
    public String friends() { return "redirect:/"; }

    @PostMapping("/request")
    public String sendRequest(@RequestParam("target") String target,
                              HttpSession session, RedirectAttributes ra) {
        UserEntity loginUser = (UserEntity) session.getAttribute("loginUser");
        boolean ok = friendService.sendRequest(loginUser, target);
        if (ok) ra.addFlashAttribute("successMsg", "친구 요청을 보냈어요!");
        else    ra.addFlashAttribute("errorMsg",   "사용자를 찾을 수 없어요.");
        return "redirect:/";
    }

    @GetMapping("/accept/{id}")
    public String accept(@PathVariable Long id, HttpSession session) {
        friendService.acceptRequest(id, (UserEntity) session.getAttribute("loginUser"));
        return "redirect:/";
    }

    @GetMapping("/reject/{id}")
    public String reject(@PathVariable Long id, HttpSession session) {
        friendService.rejectRequest(id, (UserEntity) session.getAttribute("loginUser"));
        return "redirect:/";
    }
}
