package com.sopaan.common;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

/**
 * The one canonical JSON form shared by the TypeScript, Java and Python runtimes:
 * object keys sorted (UTF-16 order), no whitespace, raw UTF-8, JSON escapes identical
 * to JSON.stringify for the characters we use.
 */
public final class CanonicalJson {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private CanonicalJson() {
    }

    public static String of(JsonNode node) {
        StringBuilder out = new StringBuilder();
        write(node, out);
        return out.toString();
    }

    public static String of(Object value) {
        return of(MAPPER.valueToTree(value));
    }

    private static void write(JsonNode node, StringBuilder out) {
        if (node == null || node.isNull()) {
            out.append("null");
        } else if (node.isObject()) {
            List<String> names = new ArrayList<>();
            Iterator<String> iterator = node.fieldNames();
            iterator.forEachRemaining(names::add);
            Collections.sort(names);
            out.append('{');
            boolean first = true;
            for (String name : names) {
                if (!first) out.append(',');
                first = false;
                quote(name, out);
                out.append(':');
                write(node.get(name), out);
            }
            out.append('}');
        } else if (node.isArray()) {
            ArrayNode array = (ArrayNode) node;
            out.append('[');
            for (int i = 0; i < array.size(); i++) {
                if (i > 0) out.append(',');
                write(array.get(i), out);
            }
            out.append(']');
        } else if (node.isTextual()) {
            quote(node.textValue(), out);
        } else {
            out.append(node.toString());
        }
    }

    private static void quote(String value, StringBuilder out) {
        out.append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        out.append('"');
    }

    public static ObjectNode object() {
        return MAPPER.createObjectNode();
    }

    public static JsonNode parse(String json) {
        try {
            return MAPPER.readTree(json);
        } catch (Exception e) {
            throw new IllegalArgumentException("invalid_json", e);
        }
    }
}
