package com.ddarungflow.service;

import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UsersRepository usersRepository;

    /**
     * OAuth 로그인 시 유저가 존재하면 정보를 업데이트하고, 없으면 새로 생성합니다.
     */
    @Transactional
    public Users saveOrUpdateOAuthUser(String provider, String providerUserId, String displayName, String email) {
        return usersRepository.findByProviderAndProviderUserId(provider, providerUserId)
                .map(user -> {
                    // 기존 유저가 존재하면 프로필 정보 및 마지막 로그인 시간 갱신
                    user.updateProfile(displayName, email);
                    user.updateLastLoginAt();
                    return user; // JPA 영속성 컨텍스트에 의해 변경 감지(Dirty Checking)로 자동 save
                })
                .orElseGet(() -> {
                    // 기존 유저가 없으면 신규 유저 생성 후 저장
                    Users newUser = Users.builder()
                            .provider(provider)
                            .providerUserId(providerUserId)
                            .displayName(displayName)
                            .email(email)
                            .build();

                    newUser.updateLastLoginAt(); // 최초 로그인 시간 설정
                    return usersRepository.save(newUser);
                });
    }
}
