package com.ddarungflow.admin.data;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminDataPipelineControllerTest {
    @Autowired MockMvc mvc;
    @Autowired UsersRepository users;

    @BeforeEach void clearUsers() {
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS admin_data_pipeline_runs (
                    run_id VARCHAR(36) PRIMARY KEY,
                    pipeline_key VARCHAR(40) NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    failure_stage VARCHAR(20),
                    reason_code VARCHAR(64),
                    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    source_collected_at TIMESTAMP WITH TIME ZONE,
                    source_count BIGINT,
                    validated_count BIGINT,
                    published_count BIGINT,
                    normal_count BIGINT,
                    missing_count BIGINT
                )
                """);
        jdbc.update("DELETE FROM admin_data_pipeline_runs");
        users.deleteAll();
    }

    @Autowired JdbcTemplate jdbc;

    @Test void reportsInsufficientEvidenceInsteadOfInferringSuccessWhenLedgerIsEmpty() throws Exception {
        mvc.perform(get("/api/v1/admin/data/pipeline-status").with(authentication(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dataState").value("INSUFFICIENT_DATA"))
                .andExpect(jsonPath("$.stages[0].stageId").value("SOURCE"))
                .andExpect(jsonPath("$.stages[0].dataState").value("INSUFFICIENT_DATA"))
                .andExpect(jsonPath("$.stages[0].reasonCode").value("PIPELINE_RUN_NOT_RECORDED"))
                .andExpect(jsonPath("$.stages.length()").value(3));
    }

    @Test void reportsActualCollectionQualityAndServingCountsFromLatestRun() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        insertRun("success-1", "SUCCESS", null, null, now.minusSeconds(2), now,
                2733L, 2733L, 2735L, 2719L, 16L);

        mvc.perform(get("/api/v1/admin/data/pipeline-status").with(authentication(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dataState").value("PARTIAL"))
                .andExpect(jsonPath("$.stages[0].stageId").value("SOURCE"))
                .andExpect(jsonPath("$.stages[0].dataState").value("NORMAL"))
                .andExpect(jsonPath("$.stages[0].processedCount").value(2733))
                .andExpect(jsonPath("$.stages[1].stageId").value("QUALITY"))
                .andExpect(jsonPath("$.stages[1].passedCount").value(2733))
                .andExpect(jsonPath("$.stages[2].stageId").value("SERVING"))
                .andExpect(jsonPath("$.stages[2].dataState").value("PARTIAL"))
                .andExpect(jsonPath("$.stages[2].passedCount").value(2719))
                .andExpect(jsonPath("$.stages[2].failedCount").value(16))
                .andExpect(jsonPath("$.stages[2].reasonCode").value("SOURCE_STATIONS_MISSING"))
                .andExpect(jsonPath("$.stages[2].sourceReference").value("station_inventory_current"));
    }

    @Test void reportsSanitizedFailedStageWithoutPromotingDownstreamStages() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        insertRun("failure-1", "FAILURE", "QUALITY", "VALIDATION_FAILURE", now.minusSeconds(1), now,
                2733L, null, null, null, null);

        mvc.perform(get("/api/v1/admin/data/pipeline-status").with(authentication(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dataState").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.stages[0].dataState").value("NORMAL"))
                .andExpect(jsonPath("$.stages[1].dataState").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.stages[1].reasonCode").value("VALIDATION_FAILURE"))
                .andExpect(jsonPath("$.stages[2].dataState").value("INSUFFICIENT_DATA"))
                .andExpect(jsonPath("$.stages[2].reasonCode").value("UPSTREAM_STAGE_FAILED"));
    }

    @Test void enforcesAdminAuthentication() throws Exception {
        mvc.perform(get("/api/v1/admin/data/pipeline-status"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
    }

    @Test void appliesV15DataConsoleAndRequestedRowCountMigration() {
        String url = "jdbc:h2:mem:admin-data-v15-migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        DriverManagerDataSource dataSource = new DriverManagerDataSource(url, "sa", "");
        JdbcTemplate migrationJdbc = new JdbcTemplate(dataSource);
        migrationJdbc.execute("""
                CREATE TABLE admin_roles (
                  code varchar(64) primary key,
                  default_console varchar(32),
                  CONSTRAINT admin_roles_default_console_check CHECK (default_console IN ('OPS', 'MODEL', 'SYSTEM'))
                )
                """);
        migrationJdbc.update("INSERT INTO admin_roles(code, default_console) VALUES ('DATA_ANALYST', 'OPS')");
        migrationJdbc.execute("CREATE TABLE export_requests (id bigint primary key)");

        Flyway flyway = Flyway.configure().dataSource(dataSource).locations("classpath:db/migration")
                .baselineOnMigrate(true).baselineVersion("14").target("15").load();
        flyway.migrate();

        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("15");
        assertThat(migrationJdbc.queryForObject(
                "SELECT default_console FROM admin_roles WHERE code = 'DATA_ANALYST'", String.class)).isEqualTo("DATA");
        migrationJdbc.update("INSERT INTO export_requests(id, requested_row_count) VALUES (1, 1000)");
        assertThatThrownBy(() -> migrationJdbc.update(
                "INSERT INTO export_requests(id, requested_row_count) VALUES (2, -1)"))
                .isInstanceOf(RuntimeException.class);
    }

    @Test void appliesV18PipelineLedgerConstraints() {
        String url = "jdbc:h2:mem:admin-data-v18-migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        DriverManagerDataSource dataSource = new DriverManagerDataSource(url, "sa", "");
        JdbcTemplate migrationJdbc = new JdbcTemplate(dataSource);
        migrationJdbc.execute("CREATE TABLE baseline_marker (id INTEGER PRIMARY KEY)");

        Flyway flyway = Flyway.configure().dataSource(dataSource).locations("classpath:db/migration")
                .baselineOnMigrate(true).baselineVersion("17").target("18").load();
        flyway.migrate();

        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("18");
        OffsetDateTime now = OffsetDateTime.now();
        migrationJdbc.update("""
                INSERT INTO admin_data_pipeline_runs
                    (run_id, pipeline_key, status, started_at, completed_at, source_collected_at,
                     source_count, validated_count, published_count, normal_count, missing_count)
                VALUES (?, 'CURRENT_INVENTORY', 'SUCCESS', ?, ?, ?, 2733, 2733, 2735, 2719, 16)
                """, "valid", now, now, now);
        assertThatThrownBy(() -> migrationJdbc.update("""
                INSERT INTO admin_data_pipeline_runs
                    (run_id, pipeline_key, status, started_at, completed_at, source_collected_at,
                     source_count, validated_count, published_count, normal_count, missing_count)
                VALUES (?, 'CURRENT_INVENTORY', 'SUCCESS', ?, ?, ?, -1, 0, 0, 0, 0)
                """, "invalid", now, now, now)).isInstanceOf(RuntimeException.class);
    }

    private void insertRun(String runId, String status, String failureStage, String reasonCode,
                           OffsetDateTime startedAt, OffsetDateTime completedAt,
                           Long sourceCount, Long validatedCount, Long publishedCount,
                           Long normalCount, Long missingCount) {
        jdbc.update("""
                INSERT INTO admin_data_pipeline_runs
                    (run_id, pipeline_key, status, failure_stage, reason_code, started_at, completed_at,
                     source_collected_at, source_count, validated_count, published_count, normal_count, missing_count)
                VALUES (?, 'CURRENT_INVENTORY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, runId, status, failureStage, reasonCode, startedAt, completedAt, completedAt,
                sourceCount, validatedCount, publishedCount, normalCount, missingCount);
    }

    private UsernamePasswordAuthenticationToken admin() {
        Users user = users.save(Users.builder().provider("google").providerUserId("data-pipeline-admin")
                .displayName("관리자").role(UserRole.ADMIN).build());
        PrincipalDetails principal = com.ddarungflow.support.AdminSecurityTestSupport.principal(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
