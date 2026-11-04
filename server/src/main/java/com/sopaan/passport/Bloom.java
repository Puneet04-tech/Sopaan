package com.sopaan.passport;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/** Revocation Bloom filter, byte-for-byte compatible with web/src/core/bloom.ts. */
public final class Bloom {
    private Bloom() {
    }

    public record Filter(int m, int k, String bits, int capacity) {
    }

    public static Filter build(List<String> items, int capacity) {
        int n = Math.max(1, Math.max(capacity, items.size()));
        int m = (int) Math.ceil((-n * Math.log(0.01)) / Math.pow(Math.log(2), 2));
        int k = Math.max(1, (int) Math.round(((double) m / n) * Math.log(2)));
        byte[] bits = new byte[(m + 7) / 8];
        for (String item : items) {
            for (int index : indexes(item, m, k)) {
                bits[index >> 3] |= (byte) (1 << (index & 7));
            }
        }
        return new Filter(m, k, Base64.getEncoder().encodeToString(bits), n);
    }

    public static boolean mightContain(Filter filter, String item) {
        byte[] bits = Base64.getDecoder().decode(filter.bits());
        for (int index : indexes(item, filter.m(), filter.k())) {
            if ((bits[index >> 3] & (1 << (index & 7))) == 0) return false;
        }
        return true;
    }

    private static List<Integer> indexes(String item, int m, int k) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(item.getBytes(StandardCharsets.UTF_8));
            List<Integer> out = new ArrayList<>();
            for (int i = 0; i < k; i++) {
                long acc = 0;
                for (int b = 0; b < 4; b++) {
                    acc = (acc * 256 + (digest[(i * 4 + b) % digest.length] & 0xff)) & 0xFFFFFFFFL;
                }
                out.add((int) (acc % m));
            }
            return out;
        } catch (Exception e) {
            throw new IllegalStateException("bloom_failed", e);
        }
    }
}
