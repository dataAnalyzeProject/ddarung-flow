package com.ddarungflow.admin.access;

import java.time.OffsetDateTime;
import java.util.Set;

public record AdminAuthoritySnapshot(Set<AdminRole> roles, Set<AdminPermission> permissions,
                                     AdminConsole defaultConsole, OffsetDateTime generatedAt) {
}
