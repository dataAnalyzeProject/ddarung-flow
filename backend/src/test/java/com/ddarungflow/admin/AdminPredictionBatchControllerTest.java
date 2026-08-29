package com.ddarungflow.admin;

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
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminPredictionBatchControllerTest {
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UsersRepository users;

    @BeforeEach void clearData() {
        jdbc.update("DELETE FROM station_predictions");
        jdbc.update("DELETE FROM prediction_batches");
        jdbc.update("DELETE FROM station_inventory_current");
        users.deleteAll();
    }

    @Test void endpointUsesExistingAdminAuthenticationContract() throws Exception {
        mvc.perform(get("/api/v1/admin/prediction-batches"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
        mvc.perform(get("/api/v1/admin/prediction-batches").with(authentication(auth(UserRole.USER))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
    }

    @Test void presentsSqlAggregatesWithoutChangingExpiredActiveStatus() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        UUID batchId = insertBatch("ACTIVE", now.minusHours(5), now.minusMinutes(4), now.minusHours(1));
        jdbc.update("INSERT INTO station_inventory_current (station_id, available_bike_count, collected_at, inventory_status, updated_at) VALUES (?, ?, ?, ?, ?)", "ST-1", 2, now, "NORMAL", now);
        jdbc.update("INSERT INTO station_inventory_current (station_id, available_bike_count, collected_at, inventory_status, updated_at) VALUES (?, ?, ?, ?, ?)", "ST-2", 3, now, "NORMAL", now);
        insertPrediction(batchId, "ST-1", 60, now);
        insertPrediction(batchId, "ST-1", 120, now);

        mvc.perform(get("/api/v1/admin/prediction-batches").with(authentication(auth(UserRole.ADMIN))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.totalBatches").value(1))
                .andExpect(jsonPath("$.summary.activeBatchCount").value(1))
                .andExpect(jsonPath("$.batches[0].publishStatus").value("ACTIVE"))
                .andExpect(jsonPath("$.batches[0].expired").value(true))
                .andExpect(jsonPath("$.batches[0].publishLagSeconds").value(60))
                .andExpect(jsonPath("$.batches[0].stationCount").value(1))
                .andExpect(jsonPath("$.batches[0].rowCount").value(2))
                .andExpect(jsonPath("$.batches[0].coverageRatio").value(0.5))
                .andExpect(jsonPath("$.batches[0].horizonCounts.60").value(1));
    }

    @Test void emitsNullLagAndCoverageWhenTheirInputsAreUnavailable() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        insertBatch("INACTIVE", now, now, now.plusHours(4));

        mvc.perform(get("/api/v1/admin/prediction-batches").with(authentication(auth(UserRole.ADMIN))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.batches[0].publishLagSeconds").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.batches[0].coverageRatio").value(org.hamcrest.Matchers.nullValue()));
    }

    private UUID insertBatch(String status, OffsetDateTime featureAsOf, OffsetDateTime generatedAt, OffsetDateTime expiresAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO prediction_batches (batch_id, created_at, expires_at, feature_as_of, generated_at, model_version, publish_status, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, generatedAt, expiresAt, featureAsOf, generatedAt, "model-test", status, status.equals("INACTIVE") ? null : generatedAt.plusMinutes(1));
        return id;
    }

    private void insertPrediction(UUID batchId, String stationId, int horizon, OffsetDateTime now) {
        jdbc.update("INSERT INTO station_predictions (batch_id, station_id, prediction_target_at, horizon_minutes, at_least_1_probability, at_least_2_probability, at_least_3_probability, at_least_4_probability, at_least_5_probability, prediction_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", batchId, stationId, now.plusMinutes(horizon), horizon, .9, .8, .7, .6, .5, "NORMAL", now);
    }

    private UsernamePasswordAuthenticationToken auth(UserRole role) {
        Users user = users.save(Users.builder().provider("google").providerUserId("batch-" + role).displayName("batch").role(role).build());
        PrincipalDetails principal = com.ddarungflow.support.AdminSecurityTestSupport.principal(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
