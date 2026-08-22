package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/access")
public class AdminAccessController {

    @GetMapping
    public Map<String, String> getAccess(@AuthenticationPrincipal PrincipalDetails principal) {
        return Map.of("role", principal.getEffectiveRole().name());
    }
}
