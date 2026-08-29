package com.ddarungflow.controller;

import com.ddarungflow.admin.access.AdminAccessService;
import com.ddarungflow.admin.access.AdminAuthorityService;
import com.ddarungflow.dto.AdminAccessDtos;
import com.ddarungflow.dto.PrincipalDetails;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminAccessController {

    private final AdminAccessService adminAccessService;

    @GetMapping("/access")
    public AdminAccessDtos.AccessResponse getAccess(@AuthenticationPrincipal PrincipalDetails principal) {
        List<com.ddarungflow.admin.access.AdminRole> roles = principal.getAdminRoles().stream().sorted().toList();
        List<com.ddarungflow.admin.access.AdminPermission> permissions = principal.getAdminPermissions().stream().sorted().toList();
        return new AdminAccessDtos.AccessResponse(principal.getEffectiveRole(), principal.getEffectiveRole(), roles, permissions,
                AdminAuthorityService.defaultConsole(principal.getAdminPermissions()), OffsetDateTime.now());
    }

    @GetMapping("/roles")
    @PreAuthorize("hasAuthority('ACCESS_READ')")
    public List<AdminAccessDtos.RoleCatalogResponse> getRoles() {
        return adminAccessService.roleCatalog();
    }
}
