package com.ddarungflow.dto;

import com.ddarungflow.admin.access.AdminPermission;
import com.ddarungflow.admin.access.AdminRole;
import com.ddarungflow.entity.Users;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.util.Collection;
import java.util.ArrayList;
import java.util.Map;
import java.util.Set;

@Getter
public class PrincipalDetails implements UserDetails, OAuth2User {

    private final Users users;
    private Map<String, Object> attributes;
    private String nameAttributeKey;
    private final Set<AdminRole> adminRoles;
    private final Set<AdminPermission> adminPermissions;

    // 1. 일반 Form 로그인용 생성자
    public PrincipalDetails(Users users) {
        this.users = users;
        this.adminRoles = Set.of();
        this.adminPermissions = Set.of();
    }

    // 2. OAuth2 소셜 로그인용 생성자
    public PrincipalDetails(Users users, Map<String, Object> attributes, String nameAttributeKey) {
        this(users, attributes, nameAttributeKey, Set.of(), Set.of());
    }

    public PrincipalDetails(Users users, Set<AdminRole> adminRoles, Set<AdminPermission> adminPermissions) {
        this(users, null, null, adminRoles, adminPermissions);
    }

    public PrincipalDetails(Users users, Map<String, Object> attributes, String nameAttributeKey,
                            Set<AdminRole> adminRoles, Set<AdminPermission> adminPermissions) {
        this.users = users;
        this.attributes = attributes;
        this.nameAttributeKey = nameAttributeKey;
        this.adminRoles = Set.copyOf(adminRoles);
        this.adminPermissions = Set.copyOf(adminPermissions);
    }

    // --- OAuth2User 구현 메소드 ---
    @Override
    public Map<String, Object> getAttributes() {
        return attributes;
    }

    @Override
    public String getName() {
        // OAuth2User의 기본 식별자 반환
        if (attributes != null && nameAttributeKey != null) {
            return String.valueOf(attributes.get(nameAttributeKey));
        }
        return users.getProviderUserId();
    }

    // --- UserDetails 구현 메소드 ---
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        ArrayList<GrantedAuthority> authorities = new ArrayList<>();
        authorities.add(new SimpleGrantedAuthority("ROLE_" + getEffectiveRole().name()));
        adminRoles.stream().sorted().map(role -> new SimpleGrantedAuthority("ADMIN_ROLE_" + role.name()))
                .forEach(authorities::add);
        adminPermissions.stream().sorted().map(permission -> new SimpleGrantedAuthority(permission.name()))
                .forEach(authorities::add);
        return authorities;
    }

    public com.ddarungflow.entity.UserRole getEffectiveRole() {
        return users.getRole();
    }

    @Override
    public String getPassword() {
        // 소셜 로그인 위주일 경우 null 반환
        return null;
    }

    @Override
    public String getUsername() {
        // UserDetails 관점에서의 사용자 식별자 (publicId 또는 providerUserId)
        return users.getPublicId() != null ? users.getPublicId().toString() : users.getProviderUserId();
    }

    @Override
    public boolean isAccountNonExpired() { return true; }

    @Override
    public boolean isAccountNonLocked() { return true; }

    @Override
    public boolean isCredentialsNonExpired() { return true; }

    @Override
    public boolean isEnabled() { return true; }
}
