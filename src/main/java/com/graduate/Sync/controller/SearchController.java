package com.graduate.Sync.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

/** 검색 페이지는 SPA가 처리. 직접 URL 접근 시 / 로 리다이렉트 */
@RequestMapping("/search")
@Controller
public class SearchController {
    @GetMapping("")
    public String search() {
        return "redirect:/";
    }
}
