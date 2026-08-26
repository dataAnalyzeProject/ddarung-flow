package com.ddarungflow.controller;

import com.ddarungflow.dto.AdminUserDtos;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.service.AdminUserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/admin/users")
public class AdminUsersController {
    private final AdminUserService adminUserService;

    @GetMapping
    public AdminUserDtos.PageResponse list(@RequestParam(defaultValue = "0") int page,
                                            @RequestParam(defaultValue = "20") int size,
                                            @RequestParam(defaultValue = "displayName,asc") String sort,
                                            @RequestParam(required = false, name = "q") String query) {
        return adminUserService.listUsers(page, size, sort, query);
    }

    @PatchMapping("/{userId}/role")
    public ResponseEntity<?> changeRole(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable UUID userId,
                                         @Valid @RequestBody AdminUserDtos.RoleChangeRequest request) {
        AdminUserService.RoleChangeResult result = adminUserService.changeRole(principal.getUsers(), userId, request.role());
        if (result.isSuccess()) return ResponseEntity.ok(result.user());
        HttpStatus status = switch (result.errorCode()) {
            case "USER_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "LAST_SUPER_ADMIN_REQUIRED" -> HttpStatus.CONFLICT;
            default -> HttpStatus.FORBIDDEN;
        };
        return ResponseEntity.status(status).body(new AdminUserDtos.ErrorResponse(result.errorCode(), result.message()));
    }

    @ExceptionHandler({IllegalArgumentException.class, HttpMessageNotReadableException.class})
    ResponseEntity<AdminUserDtos.ErrorResponse> invalidRequest(Exception error) {
        return ResponseEntity.badRequest().body(new AdminUserDtos.ErrorResponse("VALIDATION_ERROR", "입력값이 올바르지 않습니다."));
    }
}
