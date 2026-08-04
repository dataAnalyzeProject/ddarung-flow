package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.ResponseBody;

import java.net.URI;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Controller
@RequiredArgsConstructor
public class LoginController {

    private static final Set<String> SUPPORTED_PROVIDERS = Set.of("google", "kakao", "naver");

    private final UsersRepository usersRepository;

    @GetMapping("/api/v1/auth/oauth2/{provider}/start")
    public ResponseEntity<?> startOAuth(@PathVariable String provider) {
        String normalizedProvider = provider.toLowerCase();
        if (!SUPPORTED_PROVIDERS.contains(normalizedProvider)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "code", "AUTH_PROVIDER_NOT_SUPPORTED",
                    "message", "지원하지 않는 로그인 제공자입니다.",
                    "timestamp", OffsetDateTime.now().toString()
            ));
        }

        return ResponseEntity.status(302)
                .location(URI.create("/oauth2/authorization/" + normalizedProvider))
                .build();
    }

    @GetMapping("/api/v1/auth/me")
    @ResponseBody
    public ResponseEntity<?> getCurrentUser(@AuthenticationPrincipal Object principal) {
        if (principal == null || "anonymousUser".equals(principal)) {
            Map<String, Object> response = new HashMap<>();
            response.put("authenticated", false);
            response.put("user", null);
            return ResponseEntity.ok(response);
        }

        Optional<Users> authenticatedUser = Optional.empty();
        if (principal instanceof PrincipalDetails details) {
            authenticatedUser = Optional.of(details.getUsers());
        } else if (principal instanceof OAuth2User oauth2User) {
            Map<String, Object> attributes = oauth2User.getAttributes();
            String provider = null;
            String providerUserId = null;

            if (attributes.get("sub") != null) {
                provider = "google";
                providerUserId = String.valueOf(attributes.get("sub"));
            } else if (attributes.get("response") instanceof Map<?, ?> response) {
                provider = "naver";
                providerUserId = String.valueOf(response.get("id"));
            } else if (attributes.get("id") != null) {
                provider = "kakao";
                providerUserId = String.valueOf(attributes.get("id"));
            }

            if (provider != null && providerUserId != null) {
                authenticatedUser = usersRepository.findByProviderAndProviderUserId(provider, providerUserId);
            }
        }

        if (authenticatedUser.isEmpty()) {
            throw new IllegalStateException("Authenticated OAuth user is missing from users storage");
        }

        Users user = authenticatedUser.get();
        return ResponseEntity.ok(Map.of(
                "authenticated", true,
                "user", Map.of(
                        "userId", user.getPublicId().toString(),
                        "displayName", user.getDisplayName(),
                        "provider", user.getProvider()
                )
        ));
    }

    @GetMapping("/api/v1/auth/csrf")
    @ResponseBody
    public Map<String, String> getCsrfToken(CsrfToken csrfToken) {
        return Map.of(
                "token", csrfToken.getToken(),
                "headerName", csrfToken.getHeaderName()
        );
    }
}
