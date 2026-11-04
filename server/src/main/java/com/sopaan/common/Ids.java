package com.sopaan.common;

import java.security.SecureRandom;

public final class Ids {
    private static final SecureRandom RANDOM = new SecureRandom();

    private Ids() {
    }

    /** UUIDv7: 48-bit millisecond timestamp, version 7, cryptographically random tail. */
    public static String uuidv7() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        long timestamp = System.currentTimeMillis();
        for (int i = 5; i >= 0; i--) {
            bytes[i] = (byte) (timestamp & 0xff);
            timestamp >>= 8;
        }
        bytes[6] = (byte) ((bytes[6] & 0x0f) | 0x70);
        bytes[8] = (byte) ((bytes[8] & 0x3f) | 0x80);
        StringBuilder out = new StringBuilder(36);
        for (int i = 0; i < 16; i++) {
            if (i == 4 || i == 6 || i == 8 || i == 10) out.append('-');
            out.append(String.format("%02x", bytes[i]));
        }
        return out.toString();
    }

    public static String shortId(String id) {
        return id == null || id.length() <= 8 ? String.valueOf(id) : id.substring(0, 8);
    }
}
