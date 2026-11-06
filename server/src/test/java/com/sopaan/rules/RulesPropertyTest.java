package com.sopaan.rules;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import net.jqwik.api.*;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Properties the three-valued evaluator must hold for <em>every</em> profile, not just the
 * golden vectors (design 8.1: property tests with jqwik). A missing field may never silently
 * become a yes or a no.
 */
class RulesPropertyTest {

    /** One criterion leaf in the pack's own shape: {id, logic:{"==":[{"var":field},value]}, needs} */
    private static ObjectNode leaf(String id, String field, String value) {
        ObjectNode node = JsonNodeFactory.instance.objectNode();
        node.put("id", id);
        var operands = node.putObject("logic").putArray("==");
        operands.addObject().put("var", field);
        operands.add(value);
        node.putArray("needs").add(field);
        return node;
    }

    private static ObjectNode all(ObjectNode... leaves) {
        ObjectNode root = JsonNodeFactory.instance.objectNode();
        var array = root.putArray("all");
        for (ObjectNode leaf : leaves) array.add(leaf);
        return root;
    }

    private static ObjectNode any(ObjectNode... leaves) {
        ObjectNode root = JsonNodeFactory.instance.objectNode();
        var array = root.putArray("any");
        for (ObjectNode leaf : leaves) array.add(leaf);
        return root;
    }

    @Property(tries = 60)
    void missingFieldIsAlwaysNeedInfo(@ForAll boolean hasCategory) {
        ObjectNode criteria = all(leaf("c1", "category", "OBC"), leaf("c2", "district", "Pune"));
        Map<String, Object> values = new LinkedHashMap<>();
        if (hasCategory) values.put("category", "OBC");

        JsonLogic3v.Outcome outcome = JsonLogic3v.evaluate(criteria, values);
        assertEquals("UNKNOWN", outcome.value(), "a missing field can never produce a decision");
        assertTrue(outcome.missing().contains("district"));
    }

    @Property(tries = 60)
    void oneFalseLeafMakesAllFalse(@ForAll("profiles") Map<String, Object> profile) {
        ObjectNode criteria = all(leaf("c1", "category", "OBC"), leaf("c2", "gender", "female"));
        Map<String, Object> values = new LinkedHashMap<>(profile);
        values.put("category", "OBC");
        values.put("gender", "male");

        JsonLogic3v.Outcome outcome = JsonLogic3v.evaluate(criteria, values);
        assertEquals("FALSE", outcome.value());
        assertEquals("c2", outcome.failing(), "the first failing rule must be named");
    }

    @Property(tries = 60)
    void addingInformationNeverWidensAnAllNode(@ForAll("profiles") Map<String, Object> profile) {
        ObjectNode criteria = all(leaf("c1", "category", "OBC"), leaf("c2", "district", "Pune"));

        Map<String, Object> partial = new LinkedHashMap<>();
        partial.put("category", "OBC");

        JsonLogic3v.Outcome before = JsonLogic3v.evaluate(criteria, partial);
        Map<String, Object> full = new LinkedHashMap<>(partial);
        full.put("district", "Pune");
        JsonLogic3v.Outcome after = JsonLogic3v.evaluate(criteria, full);

        assertEquals("UNKNOWN", before.value());
        assertEquals("TRUE", after.value(), "answering the missing field may only complete the answer");
        assertTrue(after.missing().isEmpty());
    }

    @Property(tries = 60)
    void anyNodeIsTrueIfOneBranchIsTrue(@ForAll("profiles") Map<String, Object> profile) {
        ObjectNode criteria = any(leaf("c1", "category", "OBC"), leaf("c2", "category", "SC"));
        Map<String, Object> values = new LinkedHashMap<>(profile);
        values.put("category", "SC");

        JsonLogic3v.Outcome outcome = JsonLogic3v.evaluate(criteria, values);
        assertEquals("TRUE", outcome.value());
        assertNull(outcome.failing());
    }

    @Test
    void emptyProfileAsksForEveryNeededField() {
        ObjectNode criteria = all(leaf("c1", "category", "OBC"), leaf("c2", "family_income", "low"));
        JsonLogic3v.Outcome outcome = JsonLogic3v.evaluate(criteria, Map.of());
        assertEquals("UNKNOWN", outcome.value());
        assertTrue(outcome.missing().containsAll(java.util.List.of("category", "family_income")));
    }

    @Property(tries = 40)
    void outcomeIsAlwaysOneOfThreeValues(@ForAll("profiles") Map<String, Object> profile) {
        ObjectNode criteria = all(leaf("c1", "category", "OBC"), leaf("c2", "district", "Pune"));
        String value = JsonLogic3v.evaluate(criteria, profile).value();
        assertTrue(java.util.Set.of("TRUE", "FALSE", "UNKNOWN").contains(value), "unexpected " + value);
    }

    @Provide
    Arbitrary<Map<String, Object>> profiles() {
        Arbitrary<String> categories = Arbitraries.of("OBC", "SC", "ST", "OPEN");
        Arbitrary<String> districts = Arbitraries.of("Pune", "Nashik", "Nagpur");
        return Combinators.combine(categories, districts, Arbitraries.integers().between(0, 3))
                .as((category, district, present) -> {
                    Map<String, Object> values = new LinkedHashMap<>();
                    if (present > 0) values.put("category", category);
                    if (present > 1) values.put("district", district);
                    if (present > 2) values.put("gender", "female");
                    return values;
                });
    }
}
