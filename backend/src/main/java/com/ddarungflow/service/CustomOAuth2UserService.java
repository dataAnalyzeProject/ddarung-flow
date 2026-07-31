package com.ddarungflow.service;

import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

    private final UsersRepository usersRepository;

    @Override
    @Transactional
    public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
        OAuth2User oAuth2User = super.loadUser(userRequest);

        String provider = userRequest.getClientRegistration().getRegistrationId();
        Map<String, Object> attributes = oAuth2User.getAttributes();

        String providerUserId = null;
        String email = null;
        String displayName = null;

        if ("naver".equals(provider)) {
            Map<String, Object> response = (Map<String, Object>) attributes.get("response");
            if (response != null) {
                providerUserId = (String) response.get("id");
                email = (String) response.get("email");
                displayName = (String) response.get("name");
            }
        } else if ("google".equals(provider)) {
            providerUserId = (String) attributes.get("sub");
            email = (String) attributes.get("email");
            displayName = (String) attributes.get("name");
        } else if ("kakao".equals(provider)) {
            // 1. providerUserId는 String으로 변환
            providerUserId = String.valueOf(attributes.get("id"));

            // 2. String 타입을 붙이지 않고 기존 변수에 할당 + Null 방어 로직 추가
            Map<String, Object> kakaoAccount = (Map<String, Object>) attributes.get("kakao_account");
            if (kakaoAccount != null) {
                email = (String) kakaoAccount.get("email");

                Map<String, Object> profile = (Map<String, Object>) kakaoAccount.get("profile");
                if (profile != null) {
                    displayName = (String) profile.get("nickname");
                }
            }
        }

        // displayName이 없을 경우 기본값 세팅 (nullable = false 대응)
        if (displayName == null || displayName.isBlank()) {
            displayName = provider + "_" + (providerUserId != null && providerUserId.length() >= 6
                    ? providerUserId.substring(0, 6)
                    : providerUserId);
        }

        saveOrUpdateUser(provider, providerUserId, displayName, email);

        return oAuth2User;
    }

    private Users saveOrUpdateUser(String provider, String providerUserId, String displayName, String email) {
        return usersRepository.findByProviderAndProviderUserId(provider, providerUserId)
                .map(user -> {
                    user.updateProfile(displayName, email);
                    user.updateLastLoginAt();
                    return usersRepository.save(user);
                })
                .orElseGet(() -> {
                    Users newUser = Users.builder()
                            .provider(provider)
                            .providerUserId(providerUserId)
                            .displayName(displayName)
                            .email(email)
                            .role(UserRole.USER) // 명시적 기본 권한 부여
                            .build();
                    newUser.updateLastLoginAt();
                    return usersRepository.save(newUser);
                });
    }
}