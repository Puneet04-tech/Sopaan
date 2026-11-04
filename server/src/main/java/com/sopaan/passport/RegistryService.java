package com.sopaan.passport;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.sopaan.common.CanonicalJson;
import com.sopaan.common.Envelope;
import com.sopaan.config.KeyStore;
import com.sopaan.rules.PackService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Issuer registry: signed snapshot, epochs and a Bloom revocation set. A Bloom negative is
 * definitive; a positive only means "check the exact list or go online".
 */
@Service
public class RegistryService {
    private static final Logger log = LoggerFactory.getLogger(RegistryService.class);
    private static final int REVOCATION_CAPACITY = 2000;

    private final JdbcTemplate jdbc;
    private final KeyStore keys;
    private final PackService packs;

    public record Issuer(String kid, String org, String role, List<String> scope, int epoch,
                         String validFrom, String validTo, String pubkey, String rootSig) {
    }

    public RegistryService(JdbcTemplate jdbc, KeyStore keys, PackService packs) {
        this.jdbc = jdbc;
        this.keys = keys;
        this.packs = packs;
    }

    @PostConstruct
    public void loadIssuers() {
        JsonNode latest = packs.latest();
        if (latest == null) return;
        String rel = latest.path("registry").path("path").asText("registry/registry-3.json");
        JsonNode envelope;
        try {
            envelope = packs.readRegistry(rel);
        } catch (RuntimeException e) {
            log.warn("registry snapshot not found: {}", e.getMessage());
            return;
        }
        Envelope.Signed signed = Envelope.parse(envelope);
        boolean verified = signed.verify(keys.key("root").publicKey());
        if (!verified) {
            log.warn("registry snapshot does NOT verify against the pinned root key");
        }
        JsonNode payload = signed.payloadJson();
        for (JsonNode issuer : payload.path("issuers")) {
            jdbc.update(
                    "MERGE INTO issuer_cert (kid, org, role, scope, epoch, valid_from, valid_to, pubkey, root_sig) KEY(kid) VALUES (?,?,?,?,?,?,?,?,?)",
                    issuer.path("kid").asText(),
                    issuer.path("org").asText(),
                    issuer.path("role").asText("FACILITATOR"),
                    CanonicalJson.of(issuer.path("scope")),
                    issuer.path("epoch").asInt(1),
                    java.sql.Date.valueOf(issuer.path("valid_from").asText()),
                    java.sql.Date.valueOf(issuer.path("valid_to").asText()),
                    issuer.path("pubkey").asText(),
                    issuer.path("root_sig").asText());
        }
        log.info("Loaded {} issuer certificates (registry verified={})", payload.path("issuers").size(), verified);
    }

    public Issuer issuer(String kid) {
        List<Issuer> rows = jdbc.query(
                "SELECT kid, org, role, scope, epoch, valid_from, valid_to, pubkey, root_sig FROM issuer_cert WHERE kid = ?",
                (rs, row) -> new Issuer(
                        rs.getString("kid"),
                        rs.getString("org"),
                        rs.getString("role"),
                        parseScope(rs.getString("scope")),
                        rs.getInt("epoch"),
                        rs.getDate("valid_from").toLocalDate().toString(),
                        rs.getDate("valid_to").toLocalDate().toString(),
                        rs.getString("pubkey"),
                        rs.getString("root_sig")),
                kid);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public List<Issuer> issuers() {
        return jdbc.query(
                "SELECT kid, org, role, scope, epoch, valid_from, valid_to, pubkey, root_sig FROM issuer_cert ORDER BY kid",
                (rs, row) -> new Issuer(
                        rs.getString("kid"),
                        rs.getString("org"),
                        rs.getString("role"),
                        parseScope(rs.getString("scope")),
                        rs.getInt("epoch"),
                        rs.getDate("valid_from").toLocalDate().toString(),
                        rs.getDate("valid_to").toLocalDate().toString(),
                        rs.getString("pubkey"),
                        rs.getString("root_sig")));
    }

    public int epoch() {
        Integer value = jdbc.queryForObject("SELECT COALESCE(MAX(epoch), 1) FROM issuer_cert", Integer.class);
        return value == null ? 1 : value;
    }

    /** Rebuild and root-sign a fresh snapshot from the database state. */
    public Map<String, Object> snapshot() {
        int epoch = epoch();
        List<Map<String, Object>> issuerMaps = new ArrayList<>();
        for (Issuer issuer : issuers()) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("kid", issuer.kid());
            map.put("org", issuer.org());
            map.put("role", issuer.role());
            map.put("scope", issuer.scope());
            map.put("epoch", issuer.epoch());
            map.put("valid_from", issuer.validFrom());
            map.put("valid_to", issuer.validTo());
            map.put("pubkey", issuer.pubkey());
            map.put("root_sig", issuer.rootSig());
            issuerMaps.add(map);
        }

        List<Map<String, Object>> revoked = jdbc.query(
                "SELECT cred_id, revoked_at, reason, epoch FROM revocation ORDER BY revoked_at DESC",
                (rs, row) -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("cred_id", rs.getString("cred_id"));
                    map.put("revoked_at", rs.getTimestamp("revoked_at").toInstant().toString());
                    map.put("reason", rs.getString("reason"));
                    map.put("epoch", rs.getInt("epoch"));
                    return map;
                });
        List<String> revokedIds = revoked.stream().map(entry -> String.valueOf(entry.get("cred_id"))).toList();
        Bloom.Filter filter = Bloom.build(revokedIds, REVOCATION_CAPACITY);

        LocalDate today = LocalDate.now();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("version", "registry-" + today + "-" + epoch);
        payload.put("epoch", epoch);
        payload.put("issued_at", today.toString());
        payload.put("valid_to", today.plusMonths(2).toString());
        payload.put("synced_at", Instant.now().toString());
        payload.put("issuers", issuerMaps);
        payload.put("revoked", revoked);
        payload.put("bloom", Map.of("m", filter.m(), "k", filter.k(), "bits", filter.bits(), "capacity", filter.capacity()));
        payload.put("note", "Signed registry snapshot. A Bloom negative is definitive; a positive means possibly revoked.");
        return payload;
    }

    public Map<String, Object> signedSnapshot() {
        KeyStore.Key root = keys.key("root");
        Envelope.Signed signed = Envelope.sign(Envelope.REGISTRY, root.kid(), root.seed(), root.publicKey(), snapshot());
        return Map.of(
                "v", signed.v(),
                "kid", signed.kid(),
                "typ", signed.typ(),
                "payload", signed.payload(),
                "sig", signed.sig());
    }

    public void revoke(String credId, String reason) {
        jdbc.update(
                "MERGE INTO revocation (cred_id, revoked_at, reason, epoch) KEY(cred_id) VALUES (?, CURRENT_TIMESTAMP, ?, ?)",
                credId, reason, epoch());
        jdbc.update("UPDATE credential SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE cred_id = ?", credId);
    }

    private List<String> parseScope(String json) {
        List<String> scope = new ArrayList<>();
        try {
            JsonNode node = CanonicalJson.parse(json);
            if (node.isArray()) node.forEach(item -> scope.add(item.asText()));
        } catch (RuntimeException ignored) {
            // a malformed scope is treated as an empty scope, never as "all"
        }
        return scope;
    }

    public ArrayNode issuersJson() {
        ArrayNode array = CanonicalJson.object().arrayNode();
        issuers().forEach(issuer -> array.add(CanonicalJson.of(Map.of(
                "kid", issuer.kid(),
                "org", issuer.org(),
                "scope", issuer.scope(),
                "epoch", issuer.epoch(),
                "valid_to", issuer.validTo()))));
        return array;
    }
}
