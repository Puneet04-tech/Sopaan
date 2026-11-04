package com.sopaan.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.sopaan.common.CanonicalJson;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

/**
 * Short-lived HS256 JWTs. Every write also carries a device or issuer signature, so a
 * stolen JWT alone cannot forge an event or a credential.
 */
@Component
public class JwtService {
    public record Claims(String sub, String role, String kid, long exp) {
    }

    @Value("${sopaan.jwt-secret:dev-only-secret-change-me-please-32}")
    private String secret;

    @Value("${sopaan.jwt-ttl-seconds:3600}")
    private long ttlSeconds;

    public long ttlSeconds() {
        return ttlSeconds;
    }

    public String issue(String subject, String role, String kid) {
        long now = Instant.now().getEpochSecond();
        String header = b64(CanonicalJson.of(new Header("HS256", "JWT")));
        String payload = b64(CanonicalJson.of(new Payload(subject, role, kid, now + ttlSeconds, now)));
        String signature = sign(header + "." + payload);
        return header + "." + payload + "." + signature;
    }

    public Claims verify(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) return null;
            String expected = sign(parts[0] + "." + parts[1]);
            if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), parts[2].getBytes(StandardCharsets.UTF_8))) {
                return null;
            }
            JsonNode payload = CanonicalJson.parse(new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8));
            long exp = payload.path("exp").asLong();
            if (exp < Instant.now().getEpochSecond()) return null;
            return new Claims(
                    payload.path("sub").asText(),
                    payload.path("role").asText("DEVICE"),
                    payload.path("kid").asText(""),
                    exp);
        } catch (Exception e) {
            return null;
        }
    }

    private String sign(String input) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return b64(mac.doFinal(input.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("jwt_sign_failed", e);
        }
    }

    private static String b64(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String b64(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private record Header(String alg, String typ) {
    }

    private record Payload(String sub, String role, String kid, long exp, long iat) {
    }
}
