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

    @BeforeEach void clearUsers() { users.deleteAll(); }

    @Test void preservesNotInstrumentedStagesAndSourceBackedServingStages() throws Exception {
        mvc.perform(get("/api/v1/admin/data/pipeline-status").with(authentication(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dataState").value("PARTIAL"))
                .andExpect(jsonPath("$.stages[0].stageId").value("SOURCE"))
                .andExpect(jsonPath("$.stages[0].dataState").value("NOT_INSTRUMENTED"))
                .andExpect(jsonPath("$.stages[0].reasonCode").value("AIRFLOW_SOURCE_NOT_CONNECTED"))
                .andExpect(jsonPath("$.stages[5].stageId").value("SERVING"))
                .andExpect(jsonPath("$.stages[5].sourceReference").value("station_inventory_current"));
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

    private UsernamePasswordAuthenticationToken admin() {
        Users user = users.save(Users.builder().provider("google").providerUserId("data-pipeline-admin")
                .displayName("관리자").role(UserRole.ADMIN).build());
        PrincipalDetails principal = com.ddarungflow.support.AdminSecurityTestSupport.principal(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
