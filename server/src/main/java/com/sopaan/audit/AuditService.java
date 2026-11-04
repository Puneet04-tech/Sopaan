package com.sopaan.audit;

import com.sopaan.common.Ids;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/** Append-only, hash-chained log of consequential actions. Entries are never updated. */
@Service
public class AuditService {
    private final JdbcTemplate jdbc;

    public AuditService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public void append(String actor, String action, String ref) {
        String previous = jdbc.query(
                "SELECT hash FROM audit_log ORDER BY ts DESC LIMIT 1",
                rs -> rs.next() ? rs.getString(1) : "");
        Instant now = Instant.now();
        String hash = sha256((previous == null ? "" : previous) + "|" + actor + "|" + action + "|" + ref + "|" + now.toEpochMilli());
        jdbc.update(
                "INSERT INTO audit_log (audit_id, actor, action, ref, ts, prev_hash, hash) VALUES (?,?,?,?,?,?,?)",
                Ids.uuidv7(), actor, action, ref, Timestamp.from(now), previous, hash);
    }

    public List<Map<String, Object>> recent(int limit) {
        return jdbc.queryForList(
                "SELECT audit_id, actor, action, ref, ts, prev_hash, hash FROM audit_log ORDER BY ts DESC LIMIT ?",
                Math.min(Math.max(limit, 1), 200));
    }

    public long count() {
        Long value = jdbc.queryForObject("SELECT COUNT(*) FROM audit_log", Long.class);
        return value == null ? 0 : value;
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("sha256_failed", e);
        }
    }
}
