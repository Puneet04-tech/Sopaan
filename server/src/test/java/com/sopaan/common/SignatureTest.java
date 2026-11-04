package com.sopaan.common;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Cross-runtime signatures: the same bytes must verify in JS, Java and the verifier. */
class SignatureTest {
    private JsonNode read(String relative) throws Exception {
        Path path = Path.of("../packs/" + relative);
        if (!Files.exists(path)) path = Path.of("packs/" + relative);
        return CanonicalJson.parse(Files.readString(path));
    }

    private JsonNode keys() throws Exception {
        Path path = Path.of("../tools/dev-keys.json");
        if (!Files.exists(path)) path = Path.of("tools/dev-keys.json");
        return CanonicalJson.parse(Files.readString(path)).path("keys");
    }

    @Test
    void packSignatureAndManifestSectionsVerify() throws Exception {
        JsonNode node = read("schemes-mh/2026.10.14-1.json");
        Envelope.Signed signed = Envelope.parse(node);
        JsonNode payload = signed.payloadJson();
        String signerPubkey = payload.path("signer").path("pubkey").asText();

        ObjectNode signerRecord = CanonicalJson.object();
        signerRecord.put("kid", payload.path("signer").path("kid").asText());
        signerRecord.put("pubkey", signerPubkey);
        signerRecord.put("role", payload.path("signer").path("role").asText());
        assertTrue(Ed25519.verifyB64(keys().path("root").path("publicKey").asText(),
                CanonicalJson.of(signerRecord).getBytes(StandardCharsets.UTF_8),
                payload.path("signer").path("root_sig").asText()), "signer certificate must be root-signed");
        assertTrue(signed.verify(signerPubkey), "pack envelope must verify with the pack key");

        for (JsonNode entry : payload.path("manifest")) {
            JsonNode section = payload.path(entry.path("file").asText());
            String hash = Hex.hash(CanonicalJson.of(section));
            assertEquals(entry.path("sha256").asText(), hash, "section hash for " + entry.path("file").asText());
        }
    }

    @Test
    void tamperedFixturesAreRejected() throws Exception {
        JsonNode keys = keys();
        JsonNode pack = read("schemes-mh/2026.10.14-1.json");
        String packPubkey = Envelope.parse(pack).payloadJson().path("signer").path("pubkey").asText();

        JsonNode badSignature = read("vectors/tampered-signature.json");
        assertFalse(Envelope.parse(badSignature).verify(packPubkey), "flipped signature must fail");

        JsonNode tamperedSection = read("vectors/tampered-section.json");
        Envelope.Signed tampered = Envelope.parse(tamperedSection);
        assertTrue(tampered.verify(packPubkey), "the tampered section pack is still correctly signed");
        JsonNode payload = tampered.payloadJson();
        boolean sectionMismatch = false;
        for (JsonNode entry : payload.path("manifest")) {
            JsonNode section = payload.path(entry.path("file").asText());
            if (!Hex.hash(CanonicalJson.of(section)).equals(entry.path("sha256").asText())) sectionMismatch = true;
        }
        assertTrue(sectionMismatch, "editing a section without re-signing must break a manifest hash");
        assertTrue(keys.path("root").has("publicKey"));
    }

    @Test
    void registrySnapshotIsRootSigned() throws Exception {
        JsonNode node = read("registry/registry-3.json");
        Envelope.Signed signed = Envelope.parse(node);
        assertTrue(signed.verify(keys().path("root").path("publicKey").asText()));
        assertEquals("registry", signed.typ());
        assertEquals(3, signed.payloadJson().path("epoch").asInt());
    }

    @Test
    void canonicalJsonSortsKeysAndKeepsUtf8() {
        String json = CanonicalJson.of(CanonicalJson.parse("{\"b\":1,\"a\":\"क\",\"c\":[true,null]}"));
        assertEquals("{\"a\":\"क\",\"b\":1,\"c\":[true,null]}", json);
    }

    static final class Hex {
        static String hash(String value) {
            try {
                return java.util.HexFormat.of().formatHex(
                        java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }
    }
}
