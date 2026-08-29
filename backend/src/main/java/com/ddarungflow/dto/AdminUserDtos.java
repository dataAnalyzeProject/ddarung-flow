package com.ddarungflow.dto;

import com.ddarungflow.entity.UserRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public final class AdminUserDtos {
    private AdminUserDtos() { }

    public record UserResponse(UUID userId, String displayName, UserRole role,
                               List<AdminAccessDtos.RoleAssignmentResponse> adminRoles,
                               boolean protectedUser, long version) { }
    public record PageResponse(List<UserResponse> items, int page, int size, long total) { }
    public record RoleChangeRequest(@NotNull UserRole role, @NotBlank @Size(min = 2, max = 200) String reason) { }
    public record ErrorResponse(String code, String message) { }
}
