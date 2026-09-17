import type { ParsedRule } from "../types.js";

export interface ScannableField {
  text: string;
  line: number;
  field: "what" | "appliesTo" | "check";
}

/**
 * Fields eligible for checks 1 (dead command) and 2 (dead path): the
 * What/Applies to/Check lines of five-line-shape rules, and the derived
 * What-to-do/Check sections of a Skill. Heading-block rules have no such
 * fields — they are handled separately by check 3 only, per the brief.
 */
export function scannableFields(rule: ParsedRule): ScannableField[] {
  if (rule.shape === "heading") return [];
  const out: ScannableField[] = [];
  if (rule.whatText && rule.whatLine) out.push({ text: rule.whatText, line: rule.whatLine, field: "what" });
  if (rule.appliesToText && rule.appliesToLine) {
    out.push({ text: rule.appliesToText, line: rule.appliesToLine, field: "appliesTo" });
  }
  if (rule.checkText && rule.checkLine) out.push({ text: rule.checkText, line: rule.checkLine, field: "check" });
  return out;
}
