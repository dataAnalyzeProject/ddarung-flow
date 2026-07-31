package com.ddarungflow.controller;

import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.stereotype.Controller;

@Controller
public class LoginController {
    @GetMapping("/login")
    public String loginPage() {
        return "login";
    }
    @PostMapping("/login")
    public String handleLogin(
            @RequestParam("email") String email,
            @RequestParam("password") String password,
            @RequestParam(value = "rememberMe", defaultValue = "false") boolean rememberMe,
            Model model) {

        // 간단한 인증 처리 예시
        if ("user@seoulbike.kr".equals(email) && "1234".equals(password)) {
            return "redirect:/dashboard";
        }
        model.addAttribute("error", "이메일 또는 비밀번호가 올바르지 않습니다.");
        return "login";
    }
}
