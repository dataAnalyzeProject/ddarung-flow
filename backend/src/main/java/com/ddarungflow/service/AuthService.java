package com.ddarungflow.service;

import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class AuthService {

    private static final Set<String> SUPPORTED_PROVIDERS = Set.of("google", "naver", "kakao");

    private final UsersRepository usersRepository;

    /**
     * OAuth 로그인 시 유저가 존재하면 정보를 업데이트하고, 없으면 새로 생성합니다.
     */
    @Transactional
    public Users saveOrUpdateOAuthUser(String provider, String providerUserId, String displayName, String email, OffsetDateTime now) {
        validateOAuthInput(provider, providerUserId, displayName);

        String normalizedProvider = provider.toLowerCase();

        return usersRepository.findByProviderAndProviderUserId(normalizedProvider, providerUserId)
                .map(user -> {
                    // 기존 유저 존재 시 displayName, email, updatedAt, lastLoginAt 갱신
                    user.updateLoginProfile(displayName, email, now);
                    return user;
                })
                .orElseGet(() -> {
                    // 신규 유저 생성 (publicId, createdAt, updatedAt, lastLoginAt에 now 반영)
                    Users newUser = new Users(normalizedProvider, providerUserId, displayName, email, now);
                    return usersRepository.save(newUser);
                });
    }

    /**
     * 기존 호출 호환성을 위한 오버로딩 메서드 (현재 시각 사용)
     */
    @Transactional
    public Users saveOrUpdateOAuthUser(String provider, String providerUserId, String displayName, String email) {
        return saveOrUpdateOAuthUser(provider, providerUserId, displayName, email, OffsetDateTime.now());
    }

    private void validateOAuthInput(String provider, String providerUserId, String displayName) {
        if (provider == null || provider.isBlank()) {
            throw new IllegalArgumentException("Provider는 필수 입력값입니다.");
        }
        if (providerUserId == null || providerUserId.isBlank()) {
            throw new IllegalArgumentException("ProviderUserId는 필수 입력값입니다.");
        }
        if (displayName == null || displayName.isBlank()) {
            throw new IllegalArgumentException("DisplayName은 필수 입력값입니다.");
        }
        if (!SUPPORTED_PROVIDERS.contains(provider.toLowerCase())) {
            throw new IllegalArgumentException("지원하지 않는 Provider입니다: " + provider);
        }
    }
}
