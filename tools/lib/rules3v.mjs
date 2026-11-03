// Three-valued eligibility evaluator (design §5.5.1).
// Leaf: TRUE / FALSE / UNKNOWN when a required field is missing or low-confidence.
// ALL: any FALSE wins, else any UNKNOWN -> UNKNOWN, else TRUE.
// ANY: any TRUE wins, else any UNKNOWN -> UNKNOWN, else FALSE.
import jsonLogic from "json-logic-js";

export const CONFIDENCE_FLOOR = 0.5;

export function isKnown(value) {
  return value !== undefined && value !== null && value !== "";
}

/**
 * @param {{all?: any[], any?: any[]}} node
 * @param {Record<string, any>} values plain field values
 * @param {Record<string, number>} confidence per field, optional
 */
export function evaluateNode(node, values, confidence = {}, rulePrefix = "") {
  if (!node) return { value: "TRUE", missing: [], failing: null };

  if (Array.isArray(node.all) || Array.isArray(node.any)) {
    const isAll = Array.isArray(node.all);
    const children = isAll ? node.all : node.any;
    const results = children.map((child, index) =>
      evaluateNode(child, values, confidence, child.id ? child.id : `${rulePrefix}[${index}]`),
    );

    if (isAll) {
      const failed = results.find((r) => r.value === "FALSE");
      if (failed) return { value: "FALSE", missing: [], failing: failed.failing ?? failed.id };
      const unknown = results.find((r) => r.value === "UNKNOWN");
      if (unknown) {
        return {
          value: "UNKNOWN",
          missing: [...new Set(results.flatMap((r) => r.missing))].sort(),
          failing: null,
        };
      }
      return { value: "TRUE", missing: [], failing: null };
    }

    const passed = results.find((r) => r.value === "TRUE");
    if (passed) return { value: "TRUE", missing: [], failing: null };
    const unknown = results.find((r) => r.value === "UNKNOWN");
    if (unknown) {
      return {
        value: "UNKNOWN",
        missing: [...new Set(results.flatMap((r) => r.missing))].sort(),
        failing: null,
      };
    }
    return { value: "FALSE", missing: [], failing: results[0]?.failing ?? results[0]?.id ?? null };
  }

  // Leaf
  const needs = node.needs ?? [];
  const missing = needs.filter((field) => {
    const conf = confidence[field];
    return !isKnown(values[field]) || (typeof conf === "number" && conf < CONFIDENCE_FLOOR);
  });
  if (missing.length > 0) return { value: "UNKNOWN", missing, failing: null, id: node.id };

  let truthy = false;
  try {
    truthy = Boolean(jsonLogic.apply(node.logic, values));
  } catch {
    truthy = false;
  }
  return { value: truthy ? "TRUE" : "FALSE", missing: [], failing: truthy ? null : node.id, id: node.id };
}

export function evaluateEligibility(criteria, values, confidence = {}) {
  const result = evaluateNode(criteria, values, confidence);
  if (result.value === "TRUE") return { outcome: "ELIGIBLE", rule: null, missing: [], documents: [] };
  if (result.value === "FALSE") {
    return { outcome: "NOT_ELIGIBLE", rule: result.failing, missing: [], documents: [] };
  }
  return { outcome: "NEED_INFO", rule: null, missing: result.missing, documents: [] };
}

/** Golden expectation grammar used by the pack builder and both test suites. */
export function expectationMatches(expected, actual) {
  if (expected === "ELIGIBLE") return actual.outcome === "ELIGIBLE";
  if (expected.startsWith("NOT:")) {
    return actual.outcome === "NOT_ELIGIBLE" && actual.rule === expected.slice(4);
  }
  if (expected.startsWith("NEED:")) {
    const fields = expected
      .slice(5)
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean)
      .sort();
    return (
      actual.outcome === "NEED_INFO" &&
      JSON.stringify([...actual.missing].sort()) === JSON.stringify(fields)
    );
  }
  return false;
}
