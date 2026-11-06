package com.sopaan.rules;

import com.fasterxml.jackson.databind.JsonNode;
import com.sopaan.audit.AuditService;
import com.sopaan.common.ApiException;
import com.sopaan.common.KeyStore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Two-person review over rule packs. Approval is recorded as distinct reviewer signatures;
 * a pack only becomes PUBLISHABLE when quorum is met AND every golden vector passes.
 */
@Service
public class ReviewService {
    private final JdbcTemplate jdbc;
    private final PackService packs;
    private final KeyStore keys;
    private final AuditService audit;

    public ReviewService(JdbcTemplate jdbc, PackService packs, KeyStore keys, AuditService audit) {
        this.jdbc = jdbc;
        this.packs = packs;
        this.keys = keys;
        this.audit = audit;
    }

    public record PackRef(String name, String version) {
    }

    public PackRef parse(String packId) {
        String[] parts = packId.split("@");
        if (parts.length != 2) throw new ApiException(400, "pack_id_format_name@version");
        return new PackRef(parts[0], parts[1]);
    }

    public JsonNode payload(String packId) {
        PackRef ref = parse(packId);
        JsonNode envelope = packs.readPack(ref.name(), ref.version());
        return com.sopaan.common.Envelope.parse(envelope).payloadJson();
    }

    public List<Map<String, Object>> golden(String packId) {
        JsonNode payload = payload(packId);
        JsonNode golden = payload.path("golden");
        List<Map<String, Object>> cases = new ArrayList<>();
        for (JsonNode scheme : payload.path("schemes")) {
            String schemeId = scheme.path("id").asText();
            JsonNode tests = golden.path(schemeId);
            int index = 0;
            for (JsonNode test : tests) {
                JsonLogic3v.Outcome outcome = JsonLogic3v.evaluate(
                        scheme.path("criteria"), toMap(test.path("profile")));
                String expected = test.path("expect").asText();
                String actual = outcome.value();
                boolean pass = matches(expected, outcome);
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("scheme_id", schemeId);
                row.put("index", index++);
                row.put("expected", expected);
                row.put("actual", actual);
                row.put("failing_rule", outcome.failing());
                row.put("missing", outcome.missing());
                row.put("pass", pass);
                cases.add(row);
            }
        }
        return cases;
    }

    /**
     * Co-sign a pack as the signed-in reviewer account. The key id is never taken from the body:
     * an account is allocated one of the three reviewer seats for this pack, so the same person
     * cannot reach quorum twice with two browser tabs.
     */
    @Transactional
    public Map<String, Object> approve(String packId, String accountId, String actor) {
        PackRef ref = parse(packId);
        JsonNode payload = payload(packId);
        String reviewerKid = seat(packId, accountId);
        String expiresAt = payload.path("expires_at").asText(LocalDate.now().plusMonths(2).toString());
        Integer exists = jdbc.queryForObject("SELECT COUNT(*) FROM rule_pack WHERE pack_id = ?", Integer.class, packId);
        if (exists == null || exists == 0) {
            jdbc.update(
                    "INSERT INTO rule_pack (pack_id, name, version, expires_at, status, reviewers, manifest_sha256) VALUES (?,?,?,?, 'REVIEWING', 0, ?)",
                    packId, ref.name(), ref.version(), Date.valueOf(expiresAt), payload.path("signer").path("kid").asText(""));
        }

        jdbc.update(
                "MERGE INTO review_signature (pack_id, reviewer_kid, signed_at) KEY(pack_id, reviewer_kid) VALUES (?,?, CURRENT_TIMESTAMP)",
                packId, reviewerKid);

        // Quorum counts seats (one per account), never rows in review_signature: that table may
        // carry a historical or seeded reviewer row that no account stands behind.
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM review_seat WHERE pack_id = ?", Long.class, packId);
        boolean goldenPass = golden(packId).stream().allMatch(row -> Boolean.TRUE.equals(row.get("pass")));
        String status = (count != null && count >= 2 && goldenPass) ? "PUBLISHABLE" : "REVIEWING";
        jdbc.update("UPDATE rule_pack SET reviewers = ?, status = ? WHERE pack_id = ?", count == null ? 0 : count, status, packId);
        audit.append(actor == null ? reviewerKid : actor, "rules.review", packId + ":" + reviewerKid);

        return Map.of(
                "pack_id", packId,
                "reviewers", count == null ? 0 : count,
                "quorum", 2,
                "golden_pass", goldenPass,
                "status", status);
    }

    /** The reviewer seat held by this account on this pack, allocated on first use. */
    private String seat(String packId, String accountId) {
        if (accountId == null || accountId.isBlank()) throw new ApiException(401, "authentication_required");
        List<String> held = jdbc.queryForList(
                "SELECT reviewer_kid FROM review_seat WHERE pack_id = ? AND user_id = ?",
                String.class, packId, accountId);
        if (!held.isEmpty()) return held.get(0);

        List<String> taken = jdbc.queryForList(
                "SELECT reviewer_kid FROM review_seat WHERE pack_id = ?", String.class, packId);
        for (int slot = 1; slot <= 3; slot++) {
            KeyStore.Key candidate = keys.key("reviewer-" + slot);
            if (candidate == null || taken.contains(candidate.kid())) continue;
            jdbc.update(
                    "INSERT INTO review_seat (pack_id, user_id, reviewer_kid) VALUES (?,?,?)",
                    packId, accountId, candidate.kid());
            return candidate.kid();
        }
        throw new ApiException(409, "all_reviewer_seats_taken");
    }

    public Map<String, Object> signatures(String packId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT reviewer_kid, user_id, created_at FROM review_seat WHERE pack_id = ? ORDER BY created_at",
                packId);
        boolean goldenPass = golden(packId).stream().allMatch(row -> Boolean.TRUE.equals(row.get("pass")));
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM rule_pack WHERE pack_id = ?", Integer.class, packId);
        return Map.of(
                "pack_id", packId,
                "signatures", rows,
                "reviewers", rows.size(),
                "quorum", 2,
                "golden_pass", goldenPass,
                "publishable", rows.size() >= 2 && goldenPass,
                "registered", count != null && count > 0);
    }

    public List<Map<String, Object>> list() {
        return jdbc.queryForList(
                "SELECT pack_id, name, version, expires_at, status, reviewers, created_at FROM rule_pack ORDER BY created_at DESC");
    }

    private boolean matches(String expected, JsonLogic3v.Outcome outcome) {
        if ("ELIGIBLE".equals(expected)) return "TRUE".equals(outcome.value());
        if (expected.startsWith("NOT:")) {
            return "FALSE".equals(outcome.value()) && expected.substring(4).equals(outcome.failing());
        }
        if (expected.startsWith("NEED:")) {
            if (!"UNKNOWN".equals(outcome.value())) return false;
            String fields = expected.substring(5).replaceAll("^\\[|\\]$", "");
            List<String> wanted = new ArrayList<>();
            for (String field : fields.split(",")) {
                if (!field.trim().isEmpty()) wanted.add(field.trim());
            }
            wanted.sort(String::compareTo);
            List<String> actual = new ArrayList<>(outcome.missing());
            actual.sort(String::compareTo);
            return wanted.equals(actual);
        }
        return false;
    }

    private Map<String, Object> toMap(JsonNode node) {
        Map<String, Object> values = new LinkedHashMap<>();
        node.fields().forEachRemaining(entry -> values.put(entry.getKey(), literal(entry.getValue())));
        return values;
    }

    private Object literal(JsonNode node) {
        if (node.isNumber()) return node.numberValue();
        if (node.isBoolean()) return node.booleanValue();
        if (node.isTextual()) return node.textValue();
        if (node.isNull()) return null;
        if (node.isArray()) {
            List<Object> list = new ArrayList<>();
            node.forEach(child -> list.add(literal(child)));
            return list;
        }
        if (node.isObject()) return toMap(node);
        return node.toString();
    }
}
