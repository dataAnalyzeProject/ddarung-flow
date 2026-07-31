package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class LoginController {

    private final UsersRepository usersRepository;

    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser(@AuthenticationPrincipal Object principal) {
        Map<String, Object> response = new HashMap<>();

        if (principal == null || "anonymousUser".equals(principal)) {
            response.put("loggedIn", false);
            return ResponseEntity.ok(response);
        }

        response.put("loggedIn", true);

        if (principal instanceof PrincipalDetails details) {
            Users user = details.getUsers();
            response.put("name", user.getDisplayName());
            response.put("email", user.getEmail());
            response.put("provider", user.getProvider());
        } else if (principal instanceof OAuth2User oauth2User) {
            Map<String, Object> attributes = oauth2User.getAttributes();
            
            // 소셜 로그인 제공자 및 ID 파싱
            String provider = null;
            String providerUserId = null;

            if (attributes.get("sub") != null) {
                provider = "google";
                providerUserId = String.valueOf(attributes.get("sub"));
            } else if (attributes.get("response") != null) {
                provider = "naver";
                Map<String, Object> resp = (Map<String, Object>) attributes.get("response");
                providerUserId = String.valueOf(resp.get("id"));
            } else if (attributes.get("id") != null) {
                provider = "kakao";
                providerUserId = String.valueOf(attributes.get("id"));
            }
            
            Optional<Users> userOpt = Optional.empty();
            if (provider != null && providerUserId != null) {
                userOpt = usersRepository.findByProviderAndProviderUserId(provider, providerUserId);
            }
            
            if (userOpt.isPresent()) {
                Users u = userOpt.get();
                response.put("name", u.getDisplayName());
                response.put("email", u.getEmail());
                // 첫 글자 대문자화 (google -> Google, naver -> Naver, kakao -> Kakao)
                String p = u.getProvider();
                String formattedProvider = p != null && !p.isEmpty() 
                        ? p.substring(0, 1).toUpperCase() + p.substring(1).toLowerCase()
                        : p;
                response.put("provider", formattedProvider);
            } else {
                String name = (String) attributes.get("name");
                if (name == null && attributes.get("response") != null) {
                    Map<String, Object> resp = (Map<String, Object>) attributes.get("response");
                    name = (String) resp.get("name");
                }
                response.put("name", name != null ? name : "사용자");
                response.put("email", attributes.get("email"));
                
                String formattedProvider = provider != null 
                        ? provider.substring(0, 1).toUpperCase() + provider.substring(1).toLowerCase()
                        : "OAuth2";
                response.put("provider", formattedProvider);
            }
        } else {
            response.put("name", principal.toString());
            response.put("provider", "Unknown");
        }

        return ResponseEntity.ok(response);
    }
}
