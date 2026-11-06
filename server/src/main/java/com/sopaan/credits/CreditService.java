package com.sopaan.credits;

import com.fasterxml.jackson.databind.JsonNode;
import com.sopaan.audit.AuditService;
import com.sopaan.common.ApiException;
import com.sopaan.common.CanonicalJson;
import com.sopaan.common.Envelope;
import com.sopaan.common.KeyStore;
import com.sopaan.passport.RegistryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Allowance leases bound the sponsor's loss; counters make replay visible; settlement is
 * idempotent by token id. All amounts are SIMULATED rupees, not money.
 */
@Service
public class CreditService {
    private static final Logger log = LoggerFactory.getLogger(CreditService.class);

    private final JdbcTemplate jdbc;
    private final KeyStore keys;
    private final RegistryService registry;
    private final AuditService audit;

    public CreditService(JdbcTemplate jdbc, KeyStore keys, RegistryService registry, AuditService audit) {
        this.jdbc = jdbc;
        this.keys = keys;
        this.registry = registry;
        this.audit = audit;
    }

    @Transactional
    public Map<String, Object> registerPool(String poolId, String sponsor, int totalInr, String milestone) {
        if (poolId == null || !poolId.matches("[A-Za-z0-9._-]{3,40}")) throw new ApiException(400, "invalid_pool_id");
        if (totalInr <= 0) throw new ApiException(400, "invalid_pool_amount");
        Integer exists = jdbc.queryForObject("SELECT COUNT(*) FROM credit_pool WHERE pool_id = ?", Integer.class, poolId);
        if (exists != null && exists > 0) throw new ApiException(409, "pool_exists");
        jdbc.update(
                "INSERT INTO credit_pool (pool_id, sponsor, total_inr, remaining_inr, milestone, status) VALUES (?,?,?,?,?, 'ACTIVE')",
                poolId, sponsor, totalInr, totalInr, milestone);
        audit.append(sponsor, "credit.pool", poolId);
        return Map.of("pool_id", poolId, "total_inr", totalInr, "remaining_inr", totalInr, "milestone", milestone);
    }

    /** Store a sponsor-signed lease. Verification is signature-first, then expiry. */
    @Transactional
    public Map<String, Object> registerAllowance(JsonNode envelopeNode) {
        Envelope.Signed envelope = verifyAllowance(envelopeNode);
        JsonNode payload = envelope.payloadJson();
        jdbc.update(
                "MERGE INTO credit_allowance (allow_id, device_id, pool_id, cap_inr, ctr_start, expires_at, envelope) KEY(allow_id) VALUES (?,?,?,?,?,?,?)",
                payload.path("allow").asText(),
                payload.path("device").asText(),
                payload.path("pool").asText(),
                payload.path("cap").asInt(),
                payload.path("ctr_start").asLong(),
                payload.path("exp").asLong(),
                CanonicalJson.of(envelopeNode));
        audit.append(payload.path("device").asText("sponsor"), "credit.allowance", payload.path("allow").asText());
        return Map.of("allow_id", payload.path("allow").asText(), "cap_inr", payload.path("cap").asInt(), "status", "STORED");
    }

    @Transactional
    public Map<String, Object> settle(String actor, JsonNode request) {
        List<String> settled = new ArrayList<>();
        List<String> flagged = new ArrayList<>();
        List<Map<String, String>> reasons = new ArrayList<>();

        JsonNode allowanceNode = request.path("allowance");
        if (allowanceNode != null && allowanceNode.isObject() && allowanceNode.has("payload")) {
            registerAllowance(allowanceNode);
        }

        JsonNode tokens = request.path("tokens");
        if (!tokens.isArray()) throw new ApiException(400, "tokens_required");
        int limit = Math.min(tokens.size(), 100);

        for (int i = 0; i < limit; i++) {
            JsonNode tokenNode = tokens.get(i);
            String tokenId = tokenNode.path("token_id").asText("");
            String allowId = tokenNode.path("allow_id").asText("");
            long ctr = tokenNode.path("ctr").asLong(0);
            int amount = tokenNode.path("amount").asInt(0);
            String credId = tokenNode.path("cred_id").asText("");

            String failure = null;
            Envelope.Signed envelope = null;
            try {
                envelope = Envelope.parse(tokenNode.path("envelope"));
                if (!Envelope.TOKEN.equals(envelope.typ())) failure = "not_a_token";
                RegistryService.Issuer issuer = registry.issuer(envelope.kid());
                if (failure == null && issuer == null) failure = "unknown_issuer";
                if (failure == null && !envelope.verify(issuer.pubkey())) failure = "bad_token_signature";
                if (failure == null) {
                    JsonNode payload = envelope.payloadJson();
                    if (!tokenId.equals(payload.path("tok").asText())
                            || !allowId.equals(payload.path("allow").asText())
                            || !credId.equals(payload.path("cred").asText())
                            || amount != payload.path("amt").asInt()
                            || ctr != payload.path("ctr").asLong()) {
                        failure = "field_mismatch";
                    }
                    if (failure == null && tokenId.isEmpty()) failure = "token_id_missing";
                }
            } catch (RuntimeException e) {
                failure = "malformed_envelope";
            }

            Map<String, Object> allowance = failure == null ? allowance(allowId) : null;
            if (failure == null && allowance == null) failure = "unknown_allowance";
            if (failure == null && ((Number) allowance.get("expires_at")).longValue() < Instant.now().getEpochSecond()) {
                failure = "allowance_expired";
            }
            if (failure == null && ctr <= ((Number) allowance.get("ctr_start")).longValue()) failure = "counter_below_start";

            if (failure == null) {
                List<Map<String, Object>> duplicate = jdbc.query(
                        "SELECT token_id, status FROM credit_token WHERE allow_id = ? AND ctr = ?",
                        (rs, row) -> Map.of("token_id", rs.getString(1), "status", rs.getString(2)),
                        allowId, ctr);
                if (!duplicate.isEmpty()) {
                    String existingId = String.valueOf(duplicate.get(0).get("token_id"));
                    if (existingId.equals(tokenId) && "SETTLED".equals(duplicate.get(0).get("status"))) {
                        settled.add(tokenId); // idempotent retry
                        continue;
                    }
                    // Never un-settle the original: the lease has already paid for it. The
                    // duplicate is refused and audited; the counter that won stays settled.
                    failure = "counter_reuse";
                }
            }

            if (failure == null) {
                Long spent = jdbc.queryForObject(
                        "SELECT COALESCE(SUM(amount_inr),0) FROM credit_token WHERE allow_id = ? AND status = 'SETTLED'",
                        Long.class, allowId);
                int cap = ((Number) allowance.get("cap_inr")).intValue();
                if ((spent == null ? 0 : spent) + amount > cap) failure = "cap_exceeded";
            }

            if (failure == null) {
                String poolId = String.valueOf(allowance.get("pool_id"));
                List<Integer> remaining = jdbc.query(
                        "SELECT remaining_inr FROM credit_pool WHERE pool_id = ?",
                        (rs, row) -> rs.getInt(1), poolId);
                if (remaining.isEmpty() || remaining.get(0) < amount) {
                    failure = "pool_exhausted";
                } else {
                    try {
                        jdbc.update(
                                "INSERT INTO credit_token (token_id, allow_id, cred_id, amount_inr, ctr, status, settled_at) VALUES (?,?,?,?,?, 'SETTLED', CURRENT_TIMESTAMP)",
                                tokenId, allowId, credId, amount, ctr);
                        jdbc.update(
                                "UPDATE credit_pool SET remaining_inr = remaining_inr - ? WHERE pool_id = ?",
                                amount, poolId);
                        settled.add(tokenId);
                        audit.append(actor, "credit.settle", tokenId);
                        continue;
                    } catch (DuplicateKeyException duplicate) {
                        failure = "counter_reuse";
                    }
                }
            }

            flagged.add(tokenId);
            reasons.add(Map.of("token_id", tokenId, "code", failure));
            audit.append(actor, "credit.flag", tokenId + ":" + failure);
            log.info("token {} flagged: {}", tokenId, failure);
        }

        return Map.of(
                "settled", settled,
                "flagged", flagged,
                "reasons", reasons,
                "server_time", Instant.now().toString());
    }

    private Map<String, Object> allowance(String allowId) {
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT allow_id, device_id, pool_id, cap_inr, ctr_start, expires_at FROM credit_allowance WHERE allow_id = ?",
                (rs, row) -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("allow_id", rs.getString("allow_id"));
                    map.put("device_id", rs.getString("device_id"));
                    map.put("pool_id", rs.getString("pool_id"));
                    map.put("cap_inr", rs.getInt("cap_inr"));
                    map.put("ctr_start", rs.getLong("ctr_start"));
                    map.put("expires_at", rs.getLong("expires_at"));
                    return map;
                },
                allowId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private Envelope.Signed verifyAllowance(JsonNode envelopeNode) {
        Envelope.Signed envelope = Envelope.parse(envelopeNode.has("envelope") ? envelopeNode.get("envelope") : envelopeNode);
        if (!Envelope.ALLOWANCE.equals(envelope.typ())) throw new ApiException(400, "not_an_allowance");
        KeyStore.Key sponsor = keys.byKid(envelope.kid());
        if (sponsor == null) throw new ApiException(400, "unknown_sponsor_key");
        if (!envelope.verify(sponsor.publicKey())) throw new ApiException(400, "bad_allowance_signature");
        return envelope;
    }

    public List<Map<String, Object>> pools() {
        return jdbc.queryForList(
                "SELECT pool_id, sponsor, total_inr, remaining_inr, milestone, status FROM credit_pool ORDER BY pool_id");
    }

    public Map<String, Object> summary() {
        Long settled = jdbc.queryForObject("SELECT COUNT(*) FROM credit_token WHERE status = 'SETTLED'", Long.class);
        Long flagged = jdbc.queryForObject("SELECT COUNT(*) FROM credit_token WHERE status = 'FLAGGED'", Long.class);
        Long amount = jdbc.queryForObject("SELECT COALESCE(SUM(amount_inr),0) FROM credit_token WHERE status = 'SETTLED'", Long.class);
        return Map.of(
                "settled_tokens", settled == null ? 0 : settled,
                "flagged_tokens", flagged == null ? 0 : flagged,
                "settled_inr", amount == null ? 0 : amount,
                "currency", "SIM");
    }
}
