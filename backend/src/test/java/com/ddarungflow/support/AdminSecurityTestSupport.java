package com.ddarungflow.support;

import com.ddarungflow.admin.access.AdminRole;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;

import java.util.Set;

public final class AdminSecurityTestSupport {
    private AdminSecurityTestSupport() { }

    public static PrincipalDetails principal(Users user) {
        if (user.getRole() == UserRole.ADMIN) {
            return new PrincipalDetails(user, Set.of(AdminRole.SUPER_ADMIN), AdminRole.SUPER_ADMIN.permissions());
        }
        return new PrincipalDetails(user);
    }
}
