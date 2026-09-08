package com.ddarungflow.admin.operations;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AdminOpsGlobalRiskMigrationTest {
    @Test
    void appliesV14WithSingletonControlCoverageConstraintsAndItemCascade() {
        String url = "jdbc:h2:mem:admin-ops-global-risk-migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        DriverManagerDataSource dataSource = new DriverManagerDataSource(url, "sa", "");
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("CREATE TABLE v14_test_baseline (id integer primary key)");
        Flyway flyway = Flyway.configure().dataSource(dataSource).locations("classpath:db/migration")
                .baselineOnMigrate(true).baselineVersion("13").target("14").load();
        flyway.migrate();

        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("14");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM admin_ops_global_risk_control WHERE control_key = 'GLOBAL'", Integer.class)).isEqualTo(1);
        assertThatThrownBy(() -> insertResult(jdbc, UUID.randomUUID(), 1, 2, 1))
                .isInstanceOf(RuntimeException.class);

        UUID resultId = UUID.randomUUID();
        insertResult(jdbc, resultId, 1, 1, 1);
        jdbc.update("""
                INSERT INTO admin_ops_global_risk_items
                  (result_id, station_number, horizon_minutes, station_name, latitude, longitude, current_bikes,
                   inventory_collected_at, data_state, at_least_1_probability, at_least_2_probability,
                   at_least_3_probability, at_least_4_probability, at_least_5_probability, prediction_target_at)
                VALUES (?, '1001', 60, 'station', 37.5, 127.0, 2, ?, 'NORMAL', .9, .8, .7, .6, .5, ?)
                """, resultId, OffsetDateTime.now(), OffsetDateTime.now().plusMinutes(60));
        jdbc.update("DELETE FROM admin_ops_global_risk_results WHERE result_id = ?", resultId);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM admin_ops_global_risk_items WHERE result_id = ?", Integer.class, resultId)).isZero();
    }

    private void insertResult(JdbcTemplate jdbc, UUID id, int active, int eligible, int evaluated) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update("""
                INSERT INTO admin_ops_global_risk_results
                  (result_id, reference_time, generated_at, published_at, fresh_until, expires_at, model_version,
                   active_public_station_count, inventory_eligible_count, evaluated_count, normal_inference_count,
                   inventory_missing_count, inventory_delayed_count, inventory_unavailable_count,
                   inference_insufficient_count, unevaluated_count, inference_call_count, generation_duration_ms)
                VALUES (?, ?, ?, ?, ?, ?, 'model-v1', ?, ?, ?, ?, 0, 0, 0, 0, 0, 1, 10)
                """, id, now, now, now, now.plusMinutes(20), now.plusMinutes(30), active, eligible, evaluated, evaluated);
    }
}
