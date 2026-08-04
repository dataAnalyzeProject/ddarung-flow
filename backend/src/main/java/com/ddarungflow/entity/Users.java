package com.ddarungflow.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

import java.util.UUID;

@Entity
@Table(
    name = "users",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uk_users_provider_provider_user_id",
            columnNames = {"provider", "provider_user_id"}
        )
    }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Users {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "provider", nullable = false, length = 50)
    private String provider;

    @Column(name = "provider_user_id", nullable = false, length = 255)
    private String providerUserId;

    @Column(name = "display_name", nullable = false, length = 100)
    private String displayName;

    @Column(name = "email", length = 255)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private UserRole role;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "last_login_at")
    private OffsetDateTime lastLoginAt;

    @PrePersist
    public void prePersist() {
        if (this.publicId == null) {
            this.publicId = UUID.randomUUID();
        }

        OffsetDateTime now = OffsetDateTime.now();
        if (this.createdAt == null) this.createdAt = now;
        if (this.updatedAt == null) this.updatedAt = now;

        if (this.role == null) {
            this.role = UserRole.USER;
        }
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }

    @Builder
    public Users(String provider, String providerUserId, String displayName, String email, UserRole role) {
        this.provider = provider != null ? provider.toLowerCase() : null;
        this.providerUserId = providerUserId;
        this.displayName = displayName;
        this.email = email;
        this.role = (role != null) ? role : UserRole.USER;
    }

    // 신규 생성자 (provider, providerUserId, displayName, email, now)
    public Users(String provider, String providerUserId, String displayName, String email, OffsetDateTime now) {
        this.publicId = UUID.randomUUID();
        this.provider = provider != null ? provider.toLowerCase() : null;
        this.providerUserId = providerUserId;
        this.displayName = displayName;
        this.email = email;
        this.role = UserRole.USER;
        this.createdAt = now;
        this.updatedAt = now;
        this.lastLoginAt = now;
    }

    // 신규 업데이트 메서드: displayName, email, updatedAt, lastLoginAt 갱신
    public void updateLoginProfile(String displayName, String email, OffsetDateTime now) {
        this.displayName = displayName;
        this.email = email;
        this.updatedAt = now;
        this.lastLoginAt = now;
    }

    // 기존 OAuth 호환 메서드 (보존)
    public void updateLastLoginAt() {
        this.lastLoginAt = OffsetDateTime.now();
    }

    // 기존 OAuth 호환 메서드 (보존)
    public void updateProfile(String displayName, String email) {
        this.displayName = displayName;
        this.email = email;
    }
}
