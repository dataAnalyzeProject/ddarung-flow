package com.ddarungflow.admin.access;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "admin_user_roles", uniqueConstraints = @UniqueConstraint(
        name = "uk_admin_user_roles_user_role", columnNames = {"user_id", "role_code"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AdminUserRole {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "role_code", nullable = false, length = 50)
    private AdminRole roleCode;

    @Column(name = "granted_by", nullable = false)
    private Long grantedBy;

    @Column(name = "granted_at", nullable = false)
    private OffsetDateTime grantedAt;

    @Column(name = "expires_at")
    private OffsetDateTime expiresAt;

    @Column(name = "reason", nullable = false, length = 200)
    private String reason;

    @Column(name = "assignment_version", nullable = false)
    private long assignmentVersion;

    public AdminUserRole(Long userId, AdminRole roleCode, Long grantedBy, OffsetDateTime grantedAt,
                         OffsetDateTime expiresAt, String reason, long assignmentVersion) {
        this.userId = userId;
        this.roleCode = roleCode;
        this.grantedBy = grantedBy;
        this.grantedAt = grantedAt;
        this.expiresAt = expiresAt;
        this.reason = reason;
        this.assignmentVersion = assignmentVersion;
    }

    public boolean isActiveAt(OffsetDateTime now) {
        return expiresAt == null || expiresAt.isAfter(now);
    }

    void recordGrant(Long grantedBy, OffsetDateTime grantedAt, OffsetDateTime expiresAt,
                     String reason, long assignmentVersion) {
        this.grantedBy = grantedBy;
        this.grantedAt = grantedAt;
        this.expiresAt = expiresAt;
        this.reason = reason;
        this.assignmentVersion = assignmentVersion;
    }

    void reduceExpiry(OffsetDateTime expiresAt, long assignmentVersion) {
        this.expiresAt = expiresAt;
        this.assignmentVersion = assignmentVersion;
    }
}
