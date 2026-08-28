package com.ddarungflow.journey.persistence;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import java.sql.DriverManager;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JourneyRelease2MigrationTest {

    @Test
    void appliesV10InTheH2PostgresCompatibilityMode() throws Exception {
        String url = "jdbc:h2:mem:journey-release2-migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            statement.execute("create table users (id bigint primary key)");
        }
        Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration")
                .baselineOnMigrate(true).baselineVersion("9").target("10").load().migrate();

        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.prepareStatement("select table_name from information_schema.tables where table_schema = 'PUBLIC'")) {
            var result = statement.executeQuery();
            var tables = new java.util.ArrayList<String>();
            while (result.next()) tables.add(result.getString(1).toLowerCase());
            assertThat(tables).containsAll(List.of("journey_decisions", "journey_candidates", "saved_journeys", "saved_journey_idempotency_keys"));
        }
    }

    @Test
    void allowsMultipleRevisionsButRejectsTheSamePublicIdAndRevision() throws Exception {
        String url = "jdbc:h2:mem:journey-release2-revisions;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            statement.execute("create table users (id bigint primary key)");
        }
        Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration")
                .baselineOnMigrate(true).baselineVersion("9").target("10").load().migrate();

        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            statement.execute("insert into users (id) values (1)");
            String values = "(1, 'decision-1', %d, 'READY', '{}', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            statement.execute("insert into journey_decisions (user_id, public_id, revision, status, normalized_intent_json, contract_versions, generated_at, created_at, updated_at, expires_at) values " + String.format(values, 1));
            statement.execute("insert into journey_decisions (user_id, public_id, revision, status, normalized_intent_json, contract_versions, generated_at, created_at, updated_at, expires_at) values " + String.format(values, 2));
            assertThatThrownBy(() -> statement.execute("insert into journey_decisions (user_id, public_id, revision, status, normalized_intent_json, contract_versions, generated_at, created_at, updated_at, expires_at) values " + String.format(values, 2)))
                    .isInstanceOf(java.sql.SQLException.class);
        }
    }

    @Test
    void keepsIdempotencyKeysInTheSeparateRegistryAndCascadesTheirDeletion() throws Exception {
        String url = "jdbc:h2:mem:journey-release2-idempotency;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            statement.execute("create table users (id bigint primary key)");
        }
        Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration")
                .baselineOnMigrate(true).baselineVersion("9").target("10").load().migrate();

        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            statement.execute("insert into users (id) values (1)");
            statement.execute("insert into saved_journeys (id, public_id, user_id, display_name, replay_input_json, duplicate_key, created_at) values (1, 'saved-1', 1, 'saved', '{}', 'a', CURRENT_TIMESTAMP)");
            statement.execute("insert into saved_journey_idempotency_keys (user_id, idempotency_key, request_hash, saved_journey_id, created_at) values (1, 'key-1', 'a', 1, CURRENT_TIMESTAMP)");
            assertThatThrownBy(() -> statement.execute("insert into saved_journey_idempotency_keys (user_id, idempotency_key, request_hash, saved_journey_id, created_at) values (1, 'key-1', 'b', 1, CURRENT_TIMESTAMP)"))
                    .isInstanceOf(java.sql.SQLException.class);
            statement.execute("delete from saved_journeys where id = 1");
            var result = statement.executeQuery("select count(*) from saved_journey_idempotency_keys");
            result.next();
            assertThat(result.getLong(1)).isZero();
        }
    }
}
