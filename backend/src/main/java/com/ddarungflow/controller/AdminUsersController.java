package com.ddarungflow.controller;

import com.ddarungflow.admin.access.AdminAccessService;
import com.ddarungflow.dto.AdminAccessDtos;
import com.ddarungflow.dto.AdminUserDtos;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.service.AdminUserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/admin/users")
public class AdminUsersController {
    private final AdminUserService adminUserService;
    private final AdminAccessService adminAccessService;

    @GetMapping
    @PreAuthorize("hasAuthority('ACCESS_READ')")
    public AdminUserDtos.PageResponse list(@RequestParam(defaultValue = "0") int page,
                                            @RequestParam(defaultValue = "20") int size,
                                            @RequestParam(defaultValue = "displayName,asc") String sort,
                                            @RequestParam(required = false, name = "q") String query) {
        return adminUserService.listUsers(page, size, sort, query);
    }

    @PatchMapping("/{userId}/role")
    public ResponseEntity<?> changeRole(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable UUID userId,
                                         @Valid @RequestBody AdminUserDtos.RoleChangeRequest request) {
        AdminUserService.RoleChangeResult result = adminUserService.changeRole(principal, userId, request.role(), request.reason());
        if (result.isSuccess()) return ResponseEntity.ok(result.user());
        HttpStatus status = switch (result.errorCode()) {
            case "USER_NOT_FOUND", "ADMIN_USER_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "LAST_SUPER_ADMIN_REQUIRED" -> HttpStatus.CONFLICT;
            case "VALIDATION_ERROR" -> HttpStatus.BAD_REQUEST;
            default -> HttpStatus.FORBIDDEN;
        };
        return ResponseEntity.status(status).body(new AdminUserDtos.ErrorResponse(result.errorCode(), result.message()));
    }

    @GetMapping("/{publicUserId}/roles")
    @PreAuthorize("hasAuthority('ACCESS_READ')")
    public ResponseEntity<?> getRoles(@PathVariable UUID publicUserId) {
        AdminAccessDtos.UserRolesResponse response = adminAccessService.getUserRoles(publicUserId);
        return response == null
                ? ResponseEntity.status(HttpStatus.NOT_FOUND).body(new AdminAccessDtos.ErrorResponse("ADMIN_USER_NOT_FOUND", "사용자를 찾을 수 없습니다."))
                : ResponseEntity.ok(response);
    }

    @PutMapping("/{publicUserId}/roles")
    public ResponseEntity<?> replaceRoles(@AuthenticationPrincipal PrincipalDetails principal,
                                          @PathVariable UUID publicUserId,
                                          @Valid @RequestBody AdminAccessDtos.DesiredSetRequest request) {
        AdminAccessService.RoleUpdateResult result = adminAccessService.replaceRoles(principal, publicUserId, request);
        if (result.isSuccess()) return ResponseEntity.ok(result.response());
        HttpStatus status = switch (result.errorCode()) {
            case "ADMIN_USER_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "LAST_SUPER_ADMIN_REQUIRED", "SELF_ROLE_PROTECTED", "ROLE_ASSIGNMENT_VERSION_CONFLICT" -> HttpStatus.CONFLICT;
            case "VALIDATION_ERROR" -> HttpStatus.BAD_REQUEST;
            default -> HttpStatus.FORBIDDEN;
        };
        return ResponseEntity.status(status).body(new AdminAccessDtos.ErrorResponse(result.errorCode(), result.message()));
    }

    @ExceptionHandler({IllegalArgumentException.class, HttpMessageNotReadableException.class})
    ResponseEntity<AdminUserDtos.ErrorResponse> invalidRequest(Exception error) {
        return ResponseEntity.badRequest().body(new AdminUserDtos.ErrorResponse("VALIDATION_ERROR", "입력값이 올바르지 않습니다."));
    }
}
