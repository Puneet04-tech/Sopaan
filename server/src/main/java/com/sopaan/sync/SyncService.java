package com.sopaan.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.sopaan.audit.AuditService;
import com.sopaan.common.ApiException;
import com.sopaan.common.CanonicalJson;
import com.sopaan.common.Ed25519;
import com.sopaan.common.Ids;
import com.sopaan.rules.PackService;
import com.sopaan.security.JwtService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Idempotent ingest. Every event is verified against the enrolled device key; duplicates
 * are success; the client prunes whole outbox segments up to the contiguous high-water mark.
 */
@Service
public class SyncService {
    private static final Logger log = LoggerFactory.getLogger(SyncService.class);
    private static final int MAX_BATCH = 200;
    private static final Set<String> ROLES = Set.of("DEVICE", "FACILITATOR", "REVIEWER", "SPONSOR", "ADMIN", "HUB");

    private final JdbcTemplate jdbc;
    private final JwtService jwt;
    private final PackService packs;
    private final AuditService audit;

    @Value("${sopaan.demo-mode:false}")
    private boolean demoMode;

    public SyncService(JdbcTemplate jdbc, JwtService jwt, PackService packs, AuditService audit) {
        this.jdbc = jdbc;
        this.jwt = jwt;
        this.packs = packs;
        this.audit = audit;
    }

    public Map<String, Object> enroll(String deviceId, String studentId, String pubkey, String requestedRole) {
        if (blank(deviceId) || blank(studentId) || blank(pubkey)) throw new ApiException(400, "device_fields_required");
        if (deviceId.length() > 36 || studentId.length() > 36 || pubkey.length() > 80) throw new ApiException(400, "device_fields_too_long");

        List<String> existing = jdbc.query(
                "SELECT pubkey FROM device WHERE device_id = ?",
                (rs, row) -> rs.getString(1), deviceId);
        if (!existing.isEmpty() && !existing.get(0).equals(pubkey)) {
            throw new ApiException(409, "device_key_mismatch");
        }
        jdbc.update("MERGE INTO student (student_id, created_at) KEY(student_id) VALUES (?, CURRENT_TIMESTAMP)", studentId);
        Integer devices = jdbc.queryForObject("SELECT COUNT(*) FROM device WHERE device_id = ?", Integer.class, deviceId);
        if (devices == null || devices == 0) {
            jdbc.update(
                    "INSERT INTO device (device_id, student_id, pubkey, hwm_seq) VALUES (?,?,?,0)",
                    deviceId, studentId, pubkey);
        } else {
            jdbc.update("UPDATE device SET student_id = ?, last_seen = CURRENT_TIMESTAMP WHERE device_id = ?", studentId, deviceId);
        }

        String role = "DEVICE";
        if (demoMode && requestedRole != null && ROLES.contains(requestedRole)) {
            role = requestedRole;
            audit.append(deviceId, "demo.role", role);
        }
        String token = jwt.issue(deviceId, role, "");
        return Map.of(
                "token", token,
                "role", role,
                "expires_at", Instant.now().plus(jwt.ttlSeconds(), ChronoUnit.SECONDS).toString());
    }

    public Map<String, Object> push(String deviceId, JsonNode events) {
        List<String> pubkeys = jdbc.query(
                "SELECT pubkey FROM device WHERE device_id = ?",
                (rs, row) -> rs.getString(1), deviceId);
        if (pubkeys.isEmpty()) throw new ApiException(403, "device_not_enrolled");
        String pubkey = pubkeys.get(0);

        if (events == null || !events.isArray()) throw new ApiException(400, "events_required");
        if (events.size() > MAX_BATCH) throw new ApiException(413, "batch_too_large");

        List<Map<String, String>> rejected = new ArrayList<>();
        Set<Long> rejectedSeq = new LinkedHashSet<>();
        List<Long> insertedSeq = new ArrayList<>();

        for (JsonNode event : events) {
            String eventId = event.path("event_id").asText("");
            long seq = event.path("seq").asLong(0);
            String type = event.path("type").asText("");
            String sig = event.path("sig").asText("");
            long ts = event.path("ts").asLong(0);
            String eventDevice = event.path("device_id").asText("");
            JsonNode payload = event.path("payload");

            if (eventId.isEmpty() || seq <= 0 || type.isEmpty() || sig.isEmpty() || !eventDevice.equals(deviceId)) {
                reject(deviceId, rejected, rejectedSeq, eventId, seq, "schema_invalid");
                continue;
            }
            if (!signatureOk(pubkey, eventId, deviceId, seq, type, payload, ts, sig)) {
                reject(deviceId, rejected, rejectedSeq, eventId, seq, "bad_signature");
                continue;
            }

            try {
                jdbc.update(
                        "INSERT INTO event (event_id, device_id, seq, type, payload, ts, sig) VALUES (?,?,?,?,?,?,?)",
                        eventId, deviceId, seq, type, CanonicalJson.of(payload), ts, sig);
                insertedSeq.add(seq);
                project(deviceId, type, payload);
            } catch (DuplicateKeyException duplicate) {
                // Duplicate event id or (device, seq): already applied, so this is success.
            }
        }

        long hwm = contiguousHighWatermark(deviceId, rejectedSeq);
        jdbc.update("UPDATE device SET hwm_seq = ?, last_seen = CURRENT_TIMESTAMP WHERE device_id = ?", hwm, deviceId);
        audit.append(deviceId, "sync.push", "acked=" + hwm + " n=" + events.size());

        return Map.of(
                "acked_upto", hwm,
                "rejected", rejected,
                "server_time", Instant.now().toString());
    }

    public Map<String, Object> pull(String deviceId) {
        List<Map<String, Object>> devices = jdbc.query(
                "SELECT student_id FROM device WHERE device_id = ?",
                (rs, row) -> Map.of("student_id", rs.getString(1)), deviceId);
        if (devices.isEmpty()) throw new ApiException(403, "device_not_enrolled");
        String studentId = String.valueOf(devices.get(0).get("student_id"));

        JsonNode latest = packs.latest();
        List<Map<String, Object>> packList = new ArrayList<>();
        Map<String, Object> registryEntry = null;
        if (latest != null && latest.has("pack")) {
            JsonNode pack = latest.get("pack");
            packList.add(Map.of(
                    "name", pack.path("name").asText(),
                    "version", pack.path("version").asText(),
                    "sha256", pack.path("sha256").asText(),
                    "url", "/v1/packs/" + pack.path("name").asText() + "/" + pack.path("version").asText()));
            JsonNode registry = latest.path("registry");
            registryEntry = Map.of(
                    "version", registry.path("version").asText(),
                    "epoch", registry.path("epoch").asInt(),
                    "url", "/v1/registry/snapshot");
        }

        List<Map<String, Object>> conflicts = jdbc.query(
                "SELECT field, field_value, device_id FROM profile_field WHERE student_id = ? AND is_conflict = TRUE",
                (rs, row) -> Map.of(
                        "field", rs.getString("field"),
                        "values", List.of(String.valueOf(rs.getString("field_value"))),
                        "devices", List.of(String.valueOf(rs.getString("device_id")))),
                studentId);

        return Map.of(
                "cursor", Instant.now().toString(),
                "server_time", Instant.now().toString(),
                "packs", packList,
                "registry", registryEntry == null ? Map.of() : registryEntry,
                "conflicts", conflicts);
    }

    private void project(String deviceId, String type, JsonNode payload) {
        try {
            switch (type) {
                case "ProfileFieldConfirmed" -> projectProfile(deviceId, payload);
                case "PathwayStepRecorded" -> projectPathway(deviceId, payload);
                default -> {
                    // Other events are kept in the log; settlement reads tokens, not events.
                }
            }
        } catch (RuntimeException e) {
            log.warn("projection failed for {}: {}", type, e.getMessage());
        }
    }

    private void projectProfile(String deviceId, JsonNode payload) {
        String field = payload.path("field").asText("");
        if (field.isEmpty()) return;
        String value = payload.has("value") ? CanonicalJson.of(payload.get("value")) : "null";
        List<Map<String, Object>> deviceRow = jdbc.query(
                "SELECT student_id FROM device WHERE device_id = ?",
                (rs, row) -> Map.of("student_id", rs.getString(1)), deviceId);
        if (deviceRow.isEmpty()) return;
        String studentId = String.valueOf(deviceRow.get(0).get("student_id"));

        List<Map<String, Object>> current = jdbc.query(
                "SELECT device_id, ver, updated_at FROM profile_field WHERE student_id = ? AND field = ?",
                (rs, row) -> Map.of(
                        "device_id", String.valueOf(rs.getString("device_id")),
                        "ver", rs.getLong("ver"),
                        "updated_at", rs.getTimestamp("updated_at")),
                studentId, field);

        long version = 1;
        boolean conflict = false;
        if (!current.isEmpty()) {
            version = ((Number) current.get(0).get("ver")).longValue() + 1;
            Timestamp updated = (Timestamp) current.get(0).get("updated_at");
            boolean sameDevice = deviceId.equals(current.get(0).get("device_id"));
            boolean recent = updated != null && updated.toInstant().isAfter(Instant.now().minus(10, ChronoUnit.MINUTES));
            conflict = !sameDevice && recent;
        }
        jdbc.update(
                "MERGE INTO profile_field (student_id, field, field_value, device_id, ver, is_conflict, updated_at) KEY(student_id, field) VALUES (?,?,?,?,?,?, CURRENT_TIMESTAMP)",
                studentId, field, value, deviceId, version, conflict);
    }

    private void projectPathway(String deviceId, JsonNode payload) {
        String pathwayId = payload.path("pathway_id").asText("");
        String step = payload.path("step").asText("");
        if (pathwayId.isEmpty() || step.isEmpty()) return;
        List<String> students = jdbc.query(
                "SELECT student_id FROM device WHERE device_id = ?",
                (rs, row) -> rs.getString(1), deviceId);
        if (students.isEmpty()) return;
        try {
            jdbc.update(
                    "INSERT INTO pathway_step (student_id, pathway_id, step, event_id) VALUES (?,?,?,?)",
                    students.get(0), pathwayId, step, Ids.uuidv7());
        } catch (DuplicateKeyException ignored) {
            // a repeated completion is idempotent
        }
    }

    private boolean signatureOk(String pubkey, String eventId, String deviceId, long seq, String type, JsonNode payload, long ts, String sig) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("event_id", eventId);
        body.put("device_id", deviceId);
        body.put("seq", seq);
        body.put("type", type);
        body.put("payload", payload);
        body.put("ts", ts);
        String canonical = CanonicalJson.of(body);
        return Ed25519.verifyB64(pubkey, canonical.getBytes(StandardCharsets.UTF_8), sig);
    }

    private long contiguousHighWatermark(String deviceId, Set<Long> rejectedSeq) {
        List<Long> stored = jdbc.queryForList("SELECT seq FROM event WHERE device_id = ? ORDER BY seq", Long.class, deviceId);
        List<Long> rejectedEarlier = jdbc.queryForList("SELECT seq FROM rejected_event WHERE device_id = ? ORDER BY seq", Long.class, deviceId);
        Set<Long> all = new LinkedHashSet<>(stored);
        all.addAll(rejectedEarlier);
        all.addAll(rejectedSeq);
        List<Long> sorted = new ArrayList<>(all);
        sorted.sort(Long::compareTo);
        long hwm = 0;
        for (Long seq : sorted) {
            if (seq <= hwm) continue;
            if (seq == hwm + 1) hwm = seq;
            else break;
        }
        return hwm;
    }

    private void reject(String deviceId, List<Map<String, String>> rejected, Set<Long> seqs, String eventId, long seq, String code) {
        rejected.add(Map.of("event_id", eventId == null ? "" : eventId, "code", code));
        if (seq <= 0) return;
        seqs.add(seq);
        try {
            jdbc.update(
                    "INSERT INTO rejected_event (device_id, seq, event_id, code) VALUES (?,?,?,?)",
                    deviceId, seq, eventId == null ? "" : eventId, code);
        } catch (DuplicateKeyException ignored) {
            // the same poisoned event was already recorded
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
