package com.sopaan.config;

import com.sopaan.common.KeyStore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Demo facilitator identity. Learners, devices and credentials are only created by the
 * real enrolment and issuance paths, never by fixtures injected into the API.
 */
@Component
public class SeedRunner implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(SeedRunner.class);
    private final JdbcTemplate jdbc;
    private final KeyStore keys;

    public SeedRunner(JdbcTemplate jdbc, KeyStore keys) {
        this.jdbc = jdbc;
        this.keys = keys;
    }

    @Override
    public void run(ApplicationArguments args) {
        jdbc.update(
                "MERGE INTO student (student_id, display_alias, consent_version, created_at) KEY(student_id) VALUES ('facilitator-01', 'Demo facilitator', 'demo-v1', CURRENT_TIMESTAMP)");
        Integer cohorts = jdbc.queryForObject("SELECT COUNT(*) FROM cohort WHERE cohort_id = 'demo-cohort-01'", Integer.class);
        if (cohorts == null || cohorts == 0) {
            jdbc.update(
                    "INSERT INTO cohort (cohort_id, facilitator_id, name, district) VALUES ('demo-cohort-01', 'facilitator-01', 'Zilla Parishad Skills Cell (demo)', 'Pune (rural)')");
        }
        log.info("Ready. root kid={} issuer kid={} demo cohort=demo-cohort-01 (facilitator-01)",
                keys.key("root").kid(), keys.key("issuer-hub-1").kid());
    }
}
