package com.ddarungflow.retention;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PredictionHistoryScoringTest {
    @Autowired MockMvc mockMvc;
    @Autowired UsersRepository usersRepository;
    @Autowired PredictionHistoryRepository histories;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach void clear() { histories.deleteAll(); usersRepository.deleteAll(); }

    @Test void returnsOnlyTheAuthenticatedUsersItemsAndScoreSummary() throws Exception {
        Users owner = user("owner");
        Users other = user("other");
        PredictionHistory hit = history(owner, "ST-493", "HIGH", 2);
        PredictionHistory miss = history(owner, "ST-3325", "LOW", 2);
        history(other, "ST-999", "HIGH", 2);
        jdbc.update("UPDATE prediction_histories SET actual_bike_count=?, outcome=?, scored_at=? WHERE id=?", 3, "HIT", OffsetDateTime.now(), hit.getId());
        jdbc.update("UPDATE prediction_histories SET actual_bike_count=?, outcome=?, scored_at=? WHERE id=?", 3, "MISS", OffsetDateTime.now(), miss.getId());

        mockMvc.perform(get("/api/v1/prediction-histories").with(authentication(auth(owner))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].actualBikeCount").exists())
                .andExpect(jsonPath("$.scoreSummary.scoredCount").value(2))
                .andExpect(jsonPath("$.scoreSummary.hitCount").value(1));
    }

    @Test void unauthenticatedRequestKeepsAuthRequiredResponse() throws Exception {
        mockMvc.perform(get("/api/v1/prediction-histories"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
    }

    private Users user(String suffix) { return usersRepository.save(Users.builder().provider("google").providerUserId("score-" + suffix).displayName(suffix).role(UserRole.USER).build()); }
    private PredictionHistory history(Users user, String stationId, String level, int required) {
        PredictionHistory history = PredictionHistory.builder().userId(user.getId()).queryCondition("DIRECT").summaryResult("추천 결과").build();
        history.recordCandidate(stationId, stationId, level, "NORMAL", OffsetDateTime.now().minusHours(1), required);
        return histories.save(history);
    }
    private UsernamePasswordAuthenticationToken auth(Users user) { PrincipalDetails principal = new PrincipalDetails(user); return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()); }
}
