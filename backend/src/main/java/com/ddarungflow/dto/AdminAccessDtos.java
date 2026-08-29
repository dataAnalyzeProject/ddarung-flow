package com.ddarungflow.dto;

import com.ddarungflow.admin.access.AdminConsole;
import com.ddarungflow.admin.access.AdminPermission;
import com.ddarungflow.admin.access.AdminRole;
import com.ddarungflow.entity.UserRole;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class AdminAccessDtos {
    private AdminAccessDtos() { }

    public record AccessResponse(UserRole role, UserRole accountRole, List<AdminRole> adminRoles,
                                 List<AdminPermission> permissions, AdminConsole defaultConsole,
                                 OffsetDateTime generatedAt) { }

    public record RoleCatalogResponse(AdminRole roleCode, String displayName, String description,
                                      List<AdminPermission> permissions, boolean systemRole,
                                      boolean protectedRole, AdminConsole defaultConsole) { }

    public record RoleAssignmentResponse(AdminRole roleCode, OffsetDateTime expiresAt) { }

    public record UserRolesResponse(UUID publicUserId, String displayName, UserRole accountRole,
                                    List<RoleAssignmentResponse> adminRoles, boolean protectedUser,
                                    long version) { }

    public record RoleAssignmentRequest(AdminRole roleCode, OffsetDateTime expiresAt) { }

    public record DesiredSetRequest(Long expectedVersion, List<RoleAssignmentRequest> assignments,
                                    String reason) { }

    public record ErrorResponse(String code, String message) { }
}
