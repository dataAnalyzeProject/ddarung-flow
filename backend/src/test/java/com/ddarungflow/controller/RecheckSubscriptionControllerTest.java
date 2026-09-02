package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.notification.InAppNotification;
import com.ddarungflow.notification.InAppNotificationRepository;
import com.ddarungflow.notification.RecheckSubscriptionRepository;
import com.ddarungflow.repository.UsersRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RecheckSubscriptionControllerTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private UsersRepository usersRepository;
    @Autowired private RecheckSubscriptionRepository recheckSubscriptions;
    @Autowired private InAppNotificationRepository notifications;

    @BeforeEach
    void clean() {
        notifications.deleteAll();
        recheckSubscriptions.deleteAll();
        usersRepository.deleteAll();
    }

    @Test
    void explicitSearchOptInIsDeduplicatedAndCancelable() throws Exception {
        Users user = usersRepository.save(user("search-user"));
        OffsetDateTime departureAt = OffsetDateTime.now().plusHours(1).withNano(0);
        String request = """
                {
                  "kind":"SEARCH_RECHECK",
                  "departureAt":"%s",
                  "searchInput":{
                    "origin":{"providerId":"origin-1","displayName":"출발지","latitude":37.5,"longitude":126.9},
                    "destination":{"providerId":"destination-1","displayName":"도착지","latitude":37.6,"longitude":127.0},
                    "travelMode":"WALK",
                    "requiredBikeCount":2
                  }
                }
                """.formatted(departureAt);

        String firstBody = mockMvc.perform(post("/api/v1/recheck-subscriptions")
                        .with(authentication(authFor(user))).with(csrf())
                        .contentType("application/json").content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("SEARCH_RECHECK"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.notifyAt").value(
                        departureAt.minusMinutes(15).withOffsetSameInstant(ZoneOffset.UTC).toString()))
                .andReturn().getResponse().getContentAsString();
        JsonNode first = objectMapper.readTree(firstBody);

        String duplicateBody = mockMvc.perform(post("/api/v1/recheck-subscriptions")
                        .with(authentication(authFor(user))).with(csrf())
                        .contentType("application/json").content(request))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(objectMapper.readTree(duplicateBody).get("publicId").asText())
                .isEqualTo(first.get("publicId").asText());
        assertThat(recheckSubscriptions.count()).isEqualTo(1L);

        mockMvc.perform(delete("/api/v1/recheck-subscriptions/{publicId}", first.get("publicId").asText())
                        .with(authentication(authFor(user))).with(csrf()))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/v1/recheck-subscriptions").with(authentication(authFor(user))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("CANCELLED"));
    }

    @Test
    void searchOptInRequiresAnExplicitDepartureAtAtLeastFifteenMinutesAhead() throws Exception {
        Users user = usersRepository.save(user("invalid-time-user"));
        String request = """
                {
                  "kind":"SEARCH_RECHECK",
                  "departureAt":"%s",
                  "searchInput":{
                    "origin":{"providerId":"origin-1","displayName":"출발지","latitude":37.5,"longitude":126.9},
                    "destination":{"providerId":"destination-1","displayName":"도착지","latitude":37.6,"longitude":127.0},
                    "travelMode":"WALK",
                    "requiredBikeCount":2
                  }
                }
                """.formatted(OffsetDateTime.now().plusMinutes(14));

        mockMvc.perform(post("/api/v1/recheck-subscriptions")
                        .with(authentication(authFor(user))).with(csrf())
                        .contentType("application/json").content(request))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        assertThat(recheckSubscriptions.count()).isZero();
    }

    @Test
    void notificationFeedIncludesStructuredActionMetadata() throws Exception {
        Users user = usersRepository.save(user("notification-user"));
        notifications.save(InAppNotification.builder().userId(user.getId()).dedupKey("qna-answered:9")
                .title("문의 답변").message("답변이 등록되었습니다.").notificationType("QNA_ANSWERED")
                .actionType("QNA_QUESTION").actionRef("9").build());

        mockMvc.perform(get("/api/v1/notifications").with(authentication(authFor(user))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].notificationType").value("QNA_ANSWERED"))
                .andExpect(jsonPath("$[0].actionType").value("QNA_QUESTION"))
                .andExpect(jsonPath("$[0].actionRef").value("9"));
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
