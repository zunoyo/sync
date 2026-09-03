package com.graduate.Sync.controller;

import com.graduate.Sync.dto.UserDTO;
import com.graduate.Sync.entity.UserEntity;
import com.graduate.Sync.service.UserService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class AuthController {

    @Autowired
    private UserService userService;

    /* ── 로그인 페이지 ──────────────────────────────────────────
       error 쿼리파라미터: Google/Naver 소셜 로그인 실패 시
       OAuthApiController가 /login?error=xxx 로 리다이렉트하며 전달함
    ─────────────────────────────────────────────────────────── */
    @GetMapping("/login")
    public String loginForm(
            @RequestParam(value = "error", required = false) String error,
            Model model, HttpSession session) {
        if (session.getAttribute("loginUser") != null) return "redirect:/";

        if (error != null) {
            String msg = switch (error) {
                case "google"      -> "Google 로그인에 실패했어요. 다시 시도해주세요.";
                case "naver"       -> "네이버 로그인에 실패했어요. 다시 시도해주세요.";
                case "naver_state" -> "네이버 로그인 요청이 만료됐어요. 다시 시도해주세요.";
                default            -> "로그인에 실패했어요. 다시 시도해주세요.";
            };
            model.addAttribute("errorMsg", msg);
        }
        return "auth/login";
    }

    /* ── 로그인 처리 ── */
    @PostMapping("/login")
    public String login(UserDTO dto, HttpSession session, RedirectAttributes ra) {
        UserEntity user = userService.login(dto.getEmail(), dto.getPassword());
        if (user == null) {
            ra.addFlashAttribute("errorMsg", "이메일 또는 비밀번호가 올바르지 않습니다.");
            return "redirect:/login";
        }
        session.setAttribute("loginUser", user);
        return "redirect:/";
    }

    /* ── 회원가입 페이지 ── */
    @GetMapping("/signup")
    public String signupForm(HttpSession session) {
        if (session.getAttribute("loginUser") != null) return "redirect:/";
        return "auth/signup";
    }

    /* ── 회원가입 처리 ──────────────────────────────────────────
       1. 계정 생성 (DB 저장 + BCrypt)
       2. 자동 로그인 (서버 세션)
       3. Spotify 연동 페이지로 이동
    ─────────────────────────────────────────────────────────── */
    @PostMapping("/signup")
    public String signup(UserDTO dto, HttpSession session, RedirectAttributes ra) {
        UserEntity created = userService.signup(dto);
        if (created == null) {
            ra.addFlashAttribute("errorMsg", "이미 사용 중인 이메일 또는 사용자명입니다.");
            return "redirect:/signup";
        }

        // 회원가입 후 자동 로그인 (세션 설정)
        session.setAttribute("loginUser", created);

        // Spotify 연동 페이지로 바로 이동
        // → /api/spotify/connect 가 Spotify OAuth URL 로 서버 사이드 리다이렉트
        return "redirect:/api/spotify/connect";
    }

    /* ── 로그아웃 ── */
    @GetMapping("/logout")
    public String logout(HttpSession session) {
        session.invalidate();
        return "redirect:/login";
    }
}
