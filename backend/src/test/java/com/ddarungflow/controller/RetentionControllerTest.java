package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import com.ddarungflow.retention.SavedPredictionRoute;
import com.ddarungflow.retention.SavedPredictionRouteRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RetentionControllerTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private UsersRepository usersRepository;
    @Autowired private SavedPredictionRouteRepository savedPredictionRouteRepository;

    @BeforeEach
    void clean() {
        savedPredictionRouteRepository.deleteAll();
        usersRepository.deleteAll();
    }

    @Test
    void otherUserDeletingSavedRouteGetsStructured404() throws Exception {
        Users owner = usersRepository.save(user("owner"));
        Users otherUser = usersRepository.save(user("other"));
        SavedPredictionRoute route = savedPredictionRouteRepository.save(SavedPredictionRoute.builder()
                .userId(owner.getId()).kind("ROUTE").displayName("A → B")
                .originName("A").originLatitude(BigDecimal.ZERO).originLongitude(BigDecimal.ZERO)
                .destinationName("B").destinationLatitude(BigDecimal.ONE).destinationLongitude(BigDecimal.ONE)
                .travelMode("WALK").requiredBikeCount(1).routeKey("owner-route").build());

        mockMvc.perform(delete("/api/v1/saved-routes/{id}", route.getId())
                        .with(authentication(authFor(otherUser))).with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RETENTION_NOT_FOUND"));
    }

    private UsernamePasswordAuthenticationToken authFor(Users user) {
        PrincipalDetails principal = new PrincipalDetails(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }

    private Users user(String providerUserId) {
        return Users.builder().provider("google").providerUserId(providerUserId)
                .displayName(providerUserId).role(UserRole.USER).build();
    }
}
