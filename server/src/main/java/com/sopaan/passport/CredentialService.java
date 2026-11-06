package com.sopaan.passport;

import com.fasterxml.jackson.databind.JsonNode;
import com.sopaan.audit.AuditService;
import com.sopaan.common.ApiException;
import com.sopaan.common.CanonicalJson;
import com.sopaan.common.Envelope;
import com.sopaan.common.Ids;
import com.sopaan.common.KeyStore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class CredentialService {
    private final JdbcTemplate jdbc;
    private final KeyStore keys;
    private final RegistryService registry;
    private final AuditService audit;

    public CredentialService(JdbcTemplate jdbc, KeyStore keys, RegistryService registry, AuditService audit) {
        this.jdbc = jdbc;
        this.keys = keys;
        this.registry = registry;
        this.audit = audit;
    }

    @Transactional
    public Map<String, Object> issue(String subjectId, String skill, int level, String evidenceLabel, String issuerKid) {
        KeyStore.Key issuer = keys.byKid(issuerKid == null ? keys.key("issuer-hub-1").kid() : issuerKid);
        if (issuer == null) throw new ApiException(400, "unknown_issuer_key");
        RegistryService.Issuer cert = registry.issuer(issuer.kid());
        if (cert == null) throw new ApiException(400, "issuer_not_registered");
        boolean scoped = cert.scope().stream().anyMatch(scope -> skill.equals(scope) || skill.startsWith(scope + "."));
        if (!scoped) throw new ApiException(403, "skill_outside_issuer_scope");

        // A key can only sign inside its lease window; an expired lease must be renewed at sync
        // rather than quietly kept alive (design D6, "bound the blast radius").
        java.time.LocalDate today = java.time.LocalDate.now();
        if (cert.validFrom() != null && cert.validTo() != null) {
            java.time.LocalDate from = java.time.LocalDate.parse(cert.validFrom());
            java.time.LocalDate to = java.time.LocalDate.parse(cert.validTo());
            if (today.isBefore(from) || today.isAfter(to)) {
                throw new ApiException(403, "issuer_lease_expired");
            }
        }

        long now = Instant.now().getEpochSecond();
        long expires = Instant.now().plus(365, ChronoUnit.DAYS).getEpochSecond();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", Ids.uuidv7());
        payload.put("iss", issuer.kid());
        payload.put("epoch", cert.epoch());
        payload.put("sub", subjectId);
        payload.put("skill", skill);
        payload.put("level", level);
        payload.put("ev", sha256(evidenceLabel + "|" + subjectId + "|" + skill + "|" + now));
        payload.put("iat", now);
        payload.put("exp", expires);
        payload.put("evidence_label", evidenceLabel);

        Envelope.Signed signed = Envelope.sign(Envelope.CRED, issuer.kid(), issuer.seed(), issuer.publicKey(), payload);
        String id = String.valueOf(payload.get("id"));
        jdbc.update(
                "INSERT INTO credential (cred_id, issuer_kid, subject_id, skill, level, evidence_hash, issued_at, expiry, envelope, status, evidence_label) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                id, issuer.kid(), subjectId, skill, level, payload.get("ev"), now, expires,
                Envelope.json(signed), "VALID", evidenceLabel);
        audit.append(issuer.kid(), "credential.issue", id);
        return Map.of("credential", payload, "envelope", signed.toJson());
    }

    public JsonNode envelope(String credId) {
        List<String> rows = jdbc.query(
                "SELECT envelope FROM credential WHERE cred_id = ?",
                (rs, row) -> rs.getString("envelope"), credId);
        if (rows.isEmpty()) throw new ApiException(404, "credential_not_found");
        return CanonicalJson.parse(rows.get(0));
    }

    @Transactional
    public void revoke(String credId, String reason, String actor) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM credential WHERE cred_id = ?", Integer.class, credId);
        if (count == null || count == 0) throw new ApiException(404, "credential_not_found");
        registry.revoke(credId, reason);
        audit.append(actor, "credential.revoke", credId);
    }

    public Map<String, Object> stats() {
        Long issued = jdbc.queryForObject("SELECT COUNT(*) FROM credential", Long.class);
        Long revoked = jdbc.queryForObject("SELECT COUNT(*) FROM revocation", Long.class);
        Long valid = jdbc.queryForObject("SELECT COUNT(*) FROM credential WHERE status = 'VALID'", Long.class);
        return Map.of(
                "issued", issued == null ? 0 : issued,
                "valid", valid == null ? 0 : valid,
                "revoked", revoked == null ? 0 : revoked);
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("sha256_failed", e);
        }
    }
}
