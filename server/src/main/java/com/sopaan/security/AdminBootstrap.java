package com.sopaan.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The first administrator comes from configuration ({@code sopaan.admin.bootstrap}, an existing
 * username) so a fresh install has one path in. Every other role change goes through
 * {@link AdminController} and lands in the hash-chained audit log.
 */
@Component
public class AdminBootstrap implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    @Value("${sopaan.admin.bootstrap:}")
    private String bootstrapUsername;

    public AdminBootstrap(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (bootstrapUsername == null || bootstrapUsername.isBlank()) return;
        int changed = jdbc.update(
                "UPDATE app_user SET role = 'ADMIN' WHERE LOWER(username) = LOWER(?) AND role <> 'ADMIN'",
                bootstrapUsername.trim());
        if (changed > 0) {
            System.out.println("[sopaan] bootstrap admin granted to " + bootstrapUsername.trim());
        }
    }
}
