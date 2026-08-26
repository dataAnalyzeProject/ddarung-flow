package com.ddarungflow.service;

import com.ddarungflow.audit.AuditEventService;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AdminUserServiceTest {
    @Mock private UsersRepository usersRepository;
    @Mock private AuditEventService auditEventService;
    @InjectMocks private AdminUserService adminUserService;

    @Test
    void sameRoleReturnsSuccessWithoutChangingStateAndAuditsIt() {
        Users actor = user(1L, "actor", UserRole.ADMIN);
        Users target = user(2L, "target", UserRole.ADMIN);
        when(usersRepository.findByPublicId(target.getPublicId())).thenReturn(Optional.of(target));

        AdminUserService.RoleChangeResult result = adminUserService.changeRole(actor, target.getPublicId(), UserRole.ADMIN);

        assertTrue(result.isSuccess());
        assertEquals(UserRole.ADMIN, target.getRole());
        verify(auditEventService).appendEvent(eq(1L), eq(UserRole.ADMIN), eq("ROLE_CHANGE"), eq("USER"),
                eq(target.getPublicId().toString()), eq(AuditResult.SUCCESS), eq("ROLE_UNCHANGED"), anyString(), any());
        verify(usersRepository, never()).findAllByRoleForUpdate(any());
    }

    @Test
    void selfRoleChangeIsDeniedAndAuditedWithoutPii() {
        Users actor = user(1L, "actor", UserRole.ADMIN);
        when(usersRepository.findByPublicId(actor.getPublicId())).thenReturn(Optional.of(actor));

        AdminUserService.RoleChangeResult result = adminUserService.changeRole(actor, actor.getPublicId(), UserRole.USER);

        assertFalse(result.isSuccess());
        assertEquals("SELF_ROLE_CHANGE_FORBIDDEN", result.errorCode());
        verify(auditEventService).appendEvent(eq(1L), eq(UserRole.ADMIN), eq("ROLE_CHANGE"), eq("USER"),
                eq(actor.getPublicId().toString()), eq(AuditResult.FAILURE), eq("SELF_ROLE_CHANGE_FORBIDDEN"), anyString(), any());
    }

    @Test
    void lastAdminCannotBeLowered() {
        Users actor = user(1L, "actor", UserRole.ADMIN);
        Users target = user(2L, "target", UserRole.ADMIN);
        when(usersRepository.findByPublicId(target.getPublicId())).thenReturn(Optional.of(target));
        when(usersRepository.findAllByRoleForUpdate(UserRole.ADMIN.name())).thenReturn(List.of(target));

        AdminUserService.RoleChangeResult result = adminUserService.changeRole(actor, target.getPublicId(), UserRole.USER);

        assertFalse(result.isSuccess());
        assertEquals("LAST_SUPER_ADMIN_REQUIRED", result.errorCode());
        assertEquals(UserRole.ADMIN, target.getRole());
        verify(auditEventService).appendEvent(eq(1L), eq(UserRole.ADMIN), eq("ROLE_CHANGE"), eq("USER"),
                eq(target.getPublicId().toString()), eq(AuditResult.FAILURE), eq("LAST_SUPER_ADMIN_REQUIRED"), anyString(), any());
    }

    @Test
    void changesAnotherUsersRoleAndAuditsOnlyPublicTargetId() {
        Users actor = user(1L, "actor", UserRole.ADMIN);
        Users target = user(2L, "target", UserRole.USER);
        when(usersRepository.findByPublicId(target.getPublicId())).thenReturn(Optional.of(target));

        AdminUserService.RoleChangeResult result = adminUserService.changeRole(actor, target.getPublicId(), UserRole.ADMIN);

        assertTrue(result.isSuccess());
        assertEquals(UserRole.ADMIN, target.getRole());
        ArgumentCaptor<String> targetId = ArgumentCaptor.forClass(String.class);
        verify(auditEventService).appendEvent(eq(1L), eq(UserRole.ADMIN), eq("ROLE_CHANGE"), eq("USER"), targetId.capture(),
                eq(AuditResult.SUCCESS), eq("ROLE_CHANGED"), anyString(), any());
        assertEquals(target.getPublicId().toString(), targetId.getValue());
    }

    private Users user(Long id, String providerUserId, UserRole role) {
        Users user = Users.builder().provider("google").providerUserId(providerUserId).displayName(providerUserId).email("hidden@example.com").role(role).build();
        ReflectionTestUtils.setField(user, "id", id);
        ReflectionTestUtils.setField(user, "publicId", UUID.randomUUID());
        return user;
    }
}
