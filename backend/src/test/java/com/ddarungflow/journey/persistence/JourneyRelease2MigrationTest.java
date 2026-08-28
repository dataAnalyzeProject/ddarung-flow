package com.ddarungflow.journey.persistence;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import java.sql.DriverManager;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

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
            assertThat(tables).containsAll(List.of("journey_decisions", "journey_candidates", "saved_journeys"));
        }
    }
}
