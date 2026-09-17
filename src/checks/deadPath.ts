import { fileExists, listFiles } from "../fs-walk.js";
import { globExpand } from "../glob.js";
import { extractPathLikeTokens } from "../scan.js";
import type { Finding, ParsedRule } from "../types.js";
import { scannableFields } from "./shared.js";

export function checkDeadPath(root: string, rules: ParsedRule[]): Finding[] {
  const allFiles = listFiles(root);
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    for (const field of scannableFields(rule)) {
      for (const token of extractPathLikeTokens(field.text)) {
        const key = `${rule.file}:${field.line}:${token}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (token.includes("*")) {
          const matches = globExpand(token, allFiles);
          if (matches.length === 0) {
            findings.push({
              check: "dead-path",
              file: rule.file,
              line: field.line,
              sentence: `Dead path: \`${token}\` matches no files at the head commit.`,
              lookedFor: token,
            });
          }
        } else if (!fileExists(root, token)) {
          findings.push({
            check: "dead-path",
            file: rule.file,
            line: field.line,
            sentence: `Dead path: \`${token}\` does not exist at the head commit.`,
            lookedFor: token,
          });
        }
      }
    }
  }

  return findings;
}
