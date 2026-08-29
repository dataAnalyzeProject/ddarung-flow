package com.ddarungflow.repository;

import com.ddarungflow.entity.Users;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface UsersRepository extends JpaRepository<Users, Long> {

    // 1. provider("google", "naver", "kakao")와 providerUserId(고유 ID)로 유저 조회 (소셜 로그인용)
    Optional<Users> findByProviderAndProviderUserId(String provider, String providerUserId);

    // 2. publicId(UUID)로 유저 조회
    Optional<Users> findByPublicId(UUID publicId);

    @Query(value = "select * from users where public_id = :publicId for update", nativeQuery = true)
    Optional<Users> findByPublicIdForUpdate(@Param("publicId") UUID publicId);

    // 3. email로 유저 조회 (필요 시 사용)
    Optional<Users> findByEmail(String email);

    // 4. 특정 provider와 providerUserId 존재 여부 확인
    boolean existsByProviderAndProviderUserId(String provider, String providerUserId);

    Page<Users> findByDisplayNameContainingIgnoreCase(String displayName, Pageable pageable);

    @Query(value = "select * from users where role = :role for update", nativeQuery = true)
    java.util.List<Users> findAllByRoleForUpdate(@Param("role") String role);

}
