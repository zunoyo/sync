package com.graduate.Sync.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 메인 컨트롤러
 * GET /  → SPA (index.mustache) 서빙
 * 인증은 SPA(localStorage + auth-modal)가 처리합니다.
 */
@Controller
public class HomeController {

    @GetMapping("/")
    public String index() {
        return "index";   // SPA 전체 HTML
    }
}
