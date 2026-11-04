package com.sopaan.common;

import com.fasterxml.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Signed envelope (design §5.4). The signature covers the exact payload bytes, so the
 * server never canonicalises on verification; it only canonicalises when it signs.
 */
public final class Envelope {
    public static final String PACK = "pack";
    public static final String CRED = "cred";
    public static final String REGISTRY = "registry";
    public static final String EVENT = "event";
    public static final String TOKEN = "token";
    public static final String ALLOWANCE = "allowance";

    private Envelope() {
    }

    public record Signed(int v, String kid, String typ, String payload, String sig) {
        public JsonNode payloadJson() {
            return CanonicalJson.parse(new String(Base64.getUrlDecoder().decode(payload), StandardCharsets.UTF_8));
        }

        public boolean verify(String publicKeyB64) {
            return Ed25519.verifyB64(publicKeyB64, Base64.getUrlDecoder().decode(payload), sig);
        }

        public JsonNode toJson() {
            var node = CanonicalJson.object();
            node.put("v", v);
            node.put("kid", kid);
            node.put("typ", typ);
            node.put("payload", payload);
            node.put("sig", sig);
            return node;
        }
    }

    public static Signed parse(JsonNode node) {
        if (node == null || !node.hasNonNull("payload") || !node.hasNonNull("sig")) {
            throw new ApiException(400, "envelope_missing");
        }
        return new Signed(
                node.path("v").asInt(1),
                node.path("kid").asText(),
                node.path("typ").asText(),
                node.path("payload").asText(),
                node.path("sig").asText());
    }

    public static Signed sign(String typ, String kid, String seedB64, String publicKeyB64, Object payload) {
        String canonical = CanonicalJson.of(payload);
        byte[] bytes = canonical.getBytes(StandardCharsets.UTF_8);
        String signature = Ed25519.signB64(seedB64, canonical);
        return new Signed(
                1,
                kid,
                typ,
                Base64.getUrlEncoder().withoutPadding().encodeToString(bytes),
                signature);
    }

    public static String json(Signed envelope) {
        return CanonicalJson.of(envelope.toJson());
    }
}
