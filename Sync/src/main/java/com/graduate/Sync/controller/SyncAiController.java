package com.graduate.Sync.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

@RequestMapping("/sync")
@Controller
public class SyncAiController {
    @GetMapping("") public String ai() { return "redirect:/"; }
}
