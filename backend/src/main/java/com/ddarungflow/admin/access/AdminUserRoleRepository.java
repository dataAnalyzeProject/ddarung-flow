package com.ddarungflow.admin.access;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;

public interface AdminUserRoleRepository extends JpaRepository<AdminUserRole, Long> {
    List<AdminUserRole> findAllByUserIdOrderByRoleCodeAsc(Long userId);

    @Query("""
            select assignment from AdminUserRole assignment
            where assignment.userId = :userId
              and (assignment.expiresAt is null or assignment.expiresAt > :now)
            order by assignment.roleCode
            """)
    List<AdminUserRole> findActiveByUserId(@Param("userId") Long userId, @Param("now") OffsetDateTime now);

    @Query(value = """
            select * from admin_user_roles
            where role_code = 'SUPER_ADMIN'
              and (expires_at is null or expires_at > :now)
            order by user_id, id
            for update
            """, nativeQuery = true)
    List<AdminUserRole> findActiveSuperAdminsForUpdate(@Param("now") OffsetDateTime now);

    void deleteAllByUserId(Long userId);
}
