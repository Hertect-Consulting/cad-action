import { extractBacktickedCommands, extractPathLikeTokens } from "../scan.js";
import type { Finding, ParsedRule } from "../types.js";

export function checkNoCheckLine(rules: ParsedRule[]): Finding[] {
  const findings: Finding[] = [];

  for (const rule of rules) {
    if (rule.shape === "heading") {
      const hasCommand = extractBacktickedCommands(rule.bodyText).length > 0;
      const hasPath = extractPathLikeTokens(rule.bodyText).length > 0;
      if (!hasCommand && !hasPath) {
        findings.push({
          check: "no-check",
          file: rule.file,
          line: rule.bodyStartLine,
          sentence: `No Check line: "${rule.title}" has no backticked command and no path anywhere in it.`,
        });
      }
      continue;
    }

    // five-line or skill shape
    if (!rule.checkText || rule.checkText.trim() === "") {
      findings.push({
        check: "no-check",
        file: rule.file,
        line: rule.checkLine ?? rule.titleLine,
        sentence: `No Check line: "${rule.title}" has an empty or missing Check.`,
      });
    }
  }

  return findings;
}
