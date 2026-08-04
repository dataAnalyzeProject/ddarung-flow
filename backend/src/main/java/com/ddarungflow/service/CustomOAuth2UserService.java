package com.ddarungflow.service;

import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

    private final AuthService authService;

    public CustomOAuth2UserService(AuthService authService) {
        this.authService = authService;
    }

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
            providerUserId = String.valueOf(attributes.get("id"));

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

        authService.saveOrUpdateOAuthUser(provider, providerUserId, displayName, email);

        return oAuth2User;
    }
}