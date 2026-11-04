package com.sopaan.rules;

import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Three-valued eligibility (design §5.5.1). Same golden vectors as the TypeScript
 * evaluator; a missing field is UNKNOWN, never a silent yes.
 */
public final class JsonLogic3v {
    public static final double CONFIDENCE_FLOOR = 0.5;

    private JsonLogic3v() {
    }

    public record Outcome(String value, String failing, List<String> missing) {
        public boolean eligible() {
            return "TRUE".equals(value);
        }
    }

    private record NodeResult(String value, String failing, List<String> missing) {
    }

    public static Outcome evaluate(JsonNode criteria, Map<String, Object> values) {
        NodeResult result = evaluateNode(criteria, values);
        return new Outcome(result.value, result.failing, result.missing);
    }

    private static NodeResult evaluateNode(JsonNode node, Map<String, Object> values) {
        if (node == null) return new NodeResult("TRUE", null, List.of());
        if (node.has("all") || node.has("any")) {
            boolean isAll = node.has("all");
            JsonNode children = node.get(isAll ? "all" : "any");
            List<NodeResult> results = new ArrayList<>();
            for (JsonNode child : children) results.add(evaluateNode(child, values));

            if (isAll) {
                for (NodeResult result : results) {
                    if ("FALSE".equals(result.value)) {
                        return new NodeResult("FALSE", result.failing, List.of());
                    }
                }
                for (NodeResult result : results) {
                    if ("UNKNOWN".equals(result.value)) {
                        return new NodeResult("UNKNOWN", null, union(results));
                    }
                }
                return new NodeResult("TRUE", null, List.of());
            }
            for (NodeResult result : results) {
                if ("TRUE".equals(result.value)) return new NodeResult("TRUE", null, List.of());
            }
            for (NodeResult result : results) {
                if ("UNKNOWN".equals(result.value)) return new NodeResult("UNKNOWN", null, union(results));
            }
            return new NodeResult("FALSE", results.isEmpty() ? null : results.get(0).failing, List.of());
        }

        String id = node.path("id").asText(null);
        Set<String> missing = new LinkedHashSet<>();
        JsonNode needs = node.path("needs");
        for (JsonNode need : needs) {
            String field = need.asText();
            Object value = values.get(field);
            if (value == null || (value instanceof String text && text.isEmpty())) missing.add(field);
        }
        if (!missing.isEmpty()) {
            return new NodeResult("UNKNOWN", null, new ArrayList<>(missing));
        }
        boolean truthy = truthy(logic(node.path("logic"), values));
        return truthy
                ? new NodeResult("TRUE", null, List.of())
                : new NodeResult("FALSE", id, List.of());
    }

    private static List<String> union(List<NodeResult> results) {
        Set<String> all = new LinkedHashSet<>();
        for (NodeResult result : results) all.addAll(result.missing);
        List<String> sorted = new ArrayList<>(all);
        sorted.sort(String::compareTo);
        return sorted;
    }

    private static Object logic(JsonNode node, Map<String, Object> values) {
        if (node == null || node.isNull()) return null;
        if (!node.isObject()) return literal(node);
        String op = node.fieldNames().hasNext() ? node.fieldNames().next() : "";
        JsonNode arg = node.get(op);
        switch (op) {
            case "var": {
                String name = arg.isArray() ? arg.get(0).asText() : arg.asText();
                Object value = values.get(name);
                if (value == null && arg.isArray() && arg.size() > 1) return literal(arg.get(1));
                return value;
            }
            case "and": {
                for (JsonNode child : arg) if (!truthy(logic(child, values))) return false;
                return true;
            }
            case "or": {
                for (JsonNode child : arg) if (truthy(logic(child, values))) return true;
                return false;
            }
            case "!": return !truthy(logic(arg, values));
            case "in": {
                Object needle = logic(arg.get(0), values);
                JsonNode haystack = arg.get(1);
                if (haystack == null || !haystack.isArray()) return false;
                for (JsonNode candidate : haystack) {
                    if (equalsValue(needle, literal(candidate))) return true;
                }
                return false;
            }
            case "missing": {
                List<String> names = new ArrayList<>();
                if (arg.isArray()) arg.forEach(child -> names.add(child.asText()));
                else names.add(arg.asText());
                for (String name : names) {
                    Object value = values.get(name);
                    if (value == null || (value instanceof String text && text.isEmpty())) return true;
                }
                return false;
            }
            case "<", "<=", ">", ">=", "==", "!=": return compare(op, arg, values);
            default: return null;
        }
    }

    private static Object compare(String op, JsonNode arg, Map<String, Object> values) {
        Object left = logic(arg.get(0), values);
        Object right = logic(arg.get(1), values);
        int comparison = compareValues(left, right);
        return switch (op) {
            case "<" -> comparison < 0;
            case "<=" -> comparison <= 0;
            case ">" -> comparison > 0;
            case ">=" -> comparison >= 0;
            case "==" -> equalsValue(left, right);
            default -> !equalsValue(left, right);
        };
    }

    private static int compareValues(Object left, Object right) {
        if (left == null || right == null) return -1;
        if (left instanceof Number a && right instanceof Number b) {
            return BigDecimal.valueOf(a.doubleValue()).compareTo(BigDecimal.valueOf(b.doubleValue()));
        }
        return String.valueOf(left).compareTo(String.valueOf(right));
    }

    private static boolean equalsValue(Object left, Object right) {
        if (left instanceof Boolean || right instanceof Boolean) return Objects.equals(truthyValue(left), truthyValue(right));
        if (left instanceof Number a && right instanceof Number b) return a.doubleValue() == b.doubleValue();
        return String.valueOf(left).equals(String.valueOf(right));
    }

    private static boolean truthyValue(Object value) {
        return value instanceof Boolean bool ? bool : truthy(value);
    }

    private static boolean truthy(Object value) {
        if (value == null) return false;
        if (value instanceof Boolean bool) return bool;
        if (value instanceof Number number) return number.doubleValue() != 0;
        if (value instanceof String text) return !text.isEmpty();
        return true;
    }

    private static Object literal(JsonNode node) {
        if (node.isNumber()) return node.numberValue();
        if (node.isBoolean()) return node.booleanValue();
        if (node.isTextual()) return node.textValue();
        if (node.isNull()) return null;
        if (node.isArray()) {
            List<Object> list = new ArrayList<>();
            node.forEach(child -> list.add(literal(child)));
            return list;
        }
        return node.toString();
    }
}
