package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LoginControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UsersRepository usersRepository;

    @BeforeEach
    void clearUsers() {
        usersRepository.deleteAll();
    }

    @Test
    void unauthenticatedMeReturnsContractResponse() throws Exception {
        mockMvc.perform(get("/api/v1/auth/me"))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist("WWW-Authenticate"))
                .andExpect(jsonPath("$.authenticated").value(false))
                .andExpect(jsonPath("$.user").doesNotExist());
    }

    @Test
    void authenticatedMeReturnsOnlyApprovedUserFields() throws Exception {
        Users user = usersRepository.save(new Users(
                "google",
                "provider-user-1",
                "따릉이 사용자",
                "private@example.com",
                OffsetDateTime.now()
        ));
        PrincipalDetails principal = new PrincipalDetails(user);
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(principal, null, List.of());

        mockMvc.perform(get("/api/v1/auth/me").with(authentication(authentication)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticated").value(true))
                .andExpect(jsonPath("$.user.userId").value(user.getPublicId().toString()))
                .andExpect(jsonPath("$.user.displayName").value("따릉이 사용자"))
                .andExpect(jsonPath("$.user.provider").value("google"))
                .andExpect(jsonPath("$.user.email").doesNotExist())
                .andExpect(jsonPath("$.email").doesNotExist());
    }

    @Test
    void supportedProviderRedirectsToSpringOAuthEndpoint() throws Exception {
        mockMvc.perform(get("/api/v1/auth/oauth2/google/start"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "/oauth2/authorization/google"));
    }

    @Test
    void backendLoginPageDoesNotExist() throws Exception {
        mockMvc.perform(get("/login"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl("http://localhost:3000/login"));
    }

    @Test
    void googleLoginAlwaysRequestsAccountSelection() throws Exception {
        mockMvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", org.hamcrest.Matchers.containsString("prompt=select_account")));
    }

    @Test
    void kakaoLoginAlwaysRequestsReauthentication() throws Exception {
        mockMvc.perform(get("/oauth2/authorization/kakao"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", org.hamcrest.Matchers.containsString("prompt=login")));
    }

    @Test
    void naverLoginAlwaysRequestsReauthentication() throws Exception {
        mockMvc.perform(get("/oauth2/authorization/naver"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", org.hamcrest.Matchers.containsString("auth_type=reauthenticate")));
    }

    @Test
    void unsupportedProviderReturnsApprovedErrorCode() throws Exception {
        mockMvc.perform(get("/api/v1/auth/oauth2/github/start"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("AUTH_PROVIDER_NOT_SUPPORTED"))
                .andExpect(jsonPath("$.message").isNotEmpty())
                .andExpect(jsonPath("$.timestamp").isNotEmpty());
    }

    @Test
    void csrfEndpointReturnsTokenAndHeaderName() throws Exception {
        mockMvc.perform(get("/api/v1/auth/csrf"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.headerName").value("X-CSRF-TOKEN"));
    }

    @Test
    void logoutWithoutCsrfIsForbidden() throws Exception {
        mockMvc.perform(post("/api/v1/auth/logout"))
                .andExpect(status().isForbidden());
    }

    @Test
    void logoutWithCsrfReturnsNoContentWithoutRedirect() throws Exception {
        mockMvc.perform(post("/api/v1/auth/logout").with(csrf()))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""))
                .andExpect(redirectedUrl(null));
    }
}
