package com.sopaan.common;

import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * JDK Ed25519 over raw RFC 8032 keys. The 32-byte seed and public key are wrapped in the
 * standard DER prefixes so no BouncyCastle (or any other dependency) is needed.
 */
public final class Ed25519 {
    private static final byte[] SPKI_PREFIX = hex("302a300506032b6570032100");
    private static final byte[] PKCS8_PREFIX = hex("302e020100300506032b657004220420");

    private Ed25519() {
    }

    public static byte[] sign(byte[] seed, byte[] message) {
        try {
            PrivateKey key = privateKey(seed);
            Signature signature = Signature.getInstance("Ed25519");
            signature.initSign(key);
            signature.update(message);
            return signature.sign();
        } catch (Exception e) {
            throw new IllegalStateException("ed25519_sign_failed", e);
        }
    }

    public static boolean verify(byte[] publicKey, byte[] message, byte[] signature) {
        try {
            Signature verifier = Signature.getInstance("Ed25519");
            verifier.initVerify(publicKey(publicKey));
            verifier.update(message);
            return verifier.verify(signature);
        } catch (Exception e) {
            return false;
        }
    }

    public static PublicKey publicKey(byte[] raw) throws Exception {
        return KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(concat(SPKI_PREFIX, raw)));
    }

    public static PrivateKey privateKey(byte[] seed) throws Exception {
        return KeyFactory.getInstance("Ed25519").generatePrivate(new PKCS8EncodedKeySpec(concat(PKCS8_PREFIX, seed)));
    }

    public static String signB64(String seedB64, String message) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(sign(Base64.getUrlDecoder().decode(seedB64), message.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    public static boolean verifyB64(String publicKeyB64, byte[] message, String signatureB64) {
        try {
            return verify(
                    Base64.getUrlDecoder().decode(publicKeyB64),
                    message,
                    Base64.getUrlDecoder().decode(signatureB64));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static byte[] concat(byte[] a, byte[] b) {
        byte[] out = new byte[a.length + b.length];
        System.arraycopy(a, 0, out, 0, a.length);
        System.arraycopy(b, 0, out, a.length, b.length);
        return out;
    }

    private static byte[] hex(String value) {
        byte[] out = new byte[value.length() / 2];
        for (int i = 0; i < value.length(); i += 2) {
            out[i / 2] = (byte) Integer.parseInt(value.substring(i, i + 2), 16);
        }
        return out;
    }
}
