// Three-valued eligibility (design §5.5.1). Deterministic, versioned, cited.
// The LLM never runs here: this is the code that decides ELIGIBLE / NOT_ELIGIBLE / NEED_INFO.
import jsonLogic from "json-logic-js";
import type { RuleLeaf, RuleNode } from "./envelope";

export const CONFIDENCE_FLOOR = 0.5;

export type Outcome = "ELIGIBLE" | "NOT_ELIGIBLE" | "NEED_INFO";
export type Tri = "TRUE" | "FALSE" | "UNKNOWN";

export interface EligibilityResult {
  outcome: Outcome;
  rule: string | null;
  missing: string[];
  documents: string[];
}

interface NodeResult {
  value: Tri;
  missing: string[];
  failing: string | null;
}

export function isKnown(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function isLeaf(node: RuleLeaf | RuleNode): node is RuleLeaf {
  return typeof (node as RuleLeaf).logic === "object" && !Array.isArray((node as RuleNode).all) && !Array.isArray((node as RuleNode).any);
}

export function evaluateNode(
  node: RuleLeaf | RuleNode | undefined,
  values: Record<string, unknown>,
  confidence: Record<string, number> = {},
): NodeResult {
  if (!node) return { value: "TRUE", missing: [], failing: null };

  if (!isLeaf(node) && (Array.isArray(node.all) || Array.isArray(node.any))) {
    const isAll = Array.isArray(node.all);
    const children = (isAll ? node.all : node.any) ?? [];
    const results = children.map((child) => evaluateNode(child, values, confidence));

    if (isAll) {
      const failed = results.find((r) => r.value === "FALSE");
      if (failed) return { value: "FALSE", missing: [], failing: failed.failing };
      const unknown = results.find((r) => r.value === "UNKNOWN");
      if (unknown) return { value: "UNKNOWN", missing: unique(results.flatMap((r) => r.missing)), failing: null };
      return { value: "TRUE", missing: [], failing: null };
    }

    const passed = results.find((r) => r.value === "TRUE");
    if (passed) return { value: "TRUE", missing: [], failing: null };
    const unknown = results.find((r) => r.value === "UNKNOWN");
    if (unknown) return { value: "UNKNOWN", missing: unique(results.flatMap((r) => r.missing)), failing: null };
    return { value: "FALSE", missing: [], failing: results[0]?.failing ?? null };
  }

  const leaf = node as RuleLeaf;
  const needs = leaf.needs ?? [];
  const missing = needs.filter((field) => {
    const confidenceForField = confidence[field];
    return (
      !isKnown(values[field]) ||
      (typeof confidenceForField === "number" && confidenceForField < CONFIDENCE_FLOOR)
    );
  });
  if (missing.length > 0) return { value: "UNKNOWN", missing, failing: null };

  let truthy = false;
  try {
    truthy = Boolean(jsonLogic.apply(leaf.logic, values));
  } catch {
    truthy = false;
  }
  return { value: truthy ? "TRUE" : "FALSE", missing: [], failing: truthy ? null : leaf.id };
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function evaluateEligibility(
  criteria: RuleNode,
  values: Record<string, unknown>,
  confidence: Record<string, number> = {},
  documents: string[] = [],
): EligibilityResult {
  const result = evaluateNode(criteria, values, confidence);
  if (result.value === "TRUE") return { outcome: "ELIGIBLE", rule: null, missing: [], documents };
  if (result.value === "FALSE") {
    return { outcome: "NOT_ELIGIBLE", rule: result.failing, missing: [], documents: [] };
  }
  return { outcome: "NEED_INFO", rule: null, missing: result.missing, documents };
}

export function describeMissing(field: string): string {
  const labels: Record<string, string> = {
    class_level: "Class",
    category: "Category",
    family_income: "Family income",
    gender: "Gender",
    minority: "Minority status",
    disability: "Disability certificate",
    age: "Age",
    education_level: "Education level",
    marks_percent: "Marks %",
    district: "District",
    tailor_l1_done: "Tailoring level 1",
  };
  return labels[field] ?? field;
}

/** Golden grammar shared with tools/lib/rules3v.mjs and the Java suite. */
export function expectationMatches(expected: string, actual: EligibilityResult): boolean {
  if (expected === "ELIGIBLE") return actual.outcome === "ELIGIBLE";
  if (expected.startsWith("NOT:")) return actual.outcome === "NOT_ELIGIBLE" && actual.rule === expected.slice(4);
  if (expected.startsWith("NEED:")) {
    const fields = expected
      .slice(5)
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean)
      .sort();
    return actual.outcome === "NEED_INFO" && JSON.stringify([...actual.missing].sort()) === JSON.stringify(fields);
  }
  return false;
}
