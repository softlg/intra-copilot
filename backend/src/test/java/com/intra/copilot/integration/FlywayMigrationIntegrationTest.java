package com.intra.copilot.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class FlywayMigrationIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("pgvector/pgvector:pg16");

    @Test
    void appliesAllMigrationsAndEnforcesSecurityConstraints() throws Exception {
        Flyway flyway =
                Flyway.configure()
                        .dataSource(
                                POSTGRES.getJdbcUrl(),
                                POSTGRES.getUsername(),
                                POSTGRES.getPassword())
                        .locations("classpath:db/migration")
                        .load();

        var result = flyway.migrate();
        var migrations = flyway.info().all();
        assertTrue(migrations.length > 0);
        assertEquals(migrations.length, result.migrationsExecuted);
        assertEquals(0, flyway.info().pending().length);
        try (Connection connection =
                DriverManager.getConnection(
                        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())) {
            assertTrue(tableExists(connection, "auth_rate_limit"));
            assertTrue(tableExists(connection, "storage_delete_outbox"));
            assertTrue(tableExists(connection, "runtime_lock"));
            assertTrue(tableExists(connection, "mcp_session_lease"));
            assertThrows(
                    SQLException.class,
                    () ->
                            connection
                                    .createStatement()
                                    .executeUpdate(
                                            "INSERT INTO admin_user("
                                                    + "id,username,password_hash,enabled,role,"
                                                    + "session_version,created_at,updated_at)"
                                                    + " VALUES ('AU-invalid','invalid','x',TRUE,"
                                                    + "'INVALID',0,NOW(),NOW())"));
        }
    }

    private static boolean tableExists(Connection connection, String table) throws SQLException {
        try (var statement =
                connection.prepareStatement("SELECT to_regclass('public.' || ?) IS NOT NULL")) {
            statement.setString(1, table);
            try (var result = statement.executeQuery()) {
                result.next();
                return result.getBoolean(1);
            }
        }
    }
}
