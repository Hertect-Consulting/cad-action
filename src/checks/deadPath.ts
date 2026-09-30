import { fileExists, listFiles } from "../fs-walk.js";
import { globExpand } from "../glob.js";
import { extractBacktickedCommands, extractPathLikeTokens } from "../scan.js";
import type { Finding, ParsedRule } from "../types.js";
import { headingBlockLines, scannableFields } from "./shared.js";

/**
 * The prose case worth flagging: a backticked file path whose first folder
 * is real. `scripts/rotate-keys.sh` after the script moved, not `origin/main`
 * or `application/json`. Requires a slash, no glob, and a file extension.
 */
function isFileInsideExistingFolder(token: string, allFiles: string[]): boolean {
  const slash = token.indexOf("/");
  if (slash <= 0 || token.includes("*")) return false;
  if (!/\.[A-Za-z0-9]{1,8}$/.test(token)) return false;
  const folder = token.slice(0, slash + 1);
  return allFiles.some((f) => f.startsWith(folder));
}

export function checkDeadPath(root: string, rules: ParsedRule[]): Finding[] {
  const allFiles = listFiles(root);
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    for (const { text, line } of headingBlockLines(rule)) {
      for (const span of extractBacktickedCommands(text)) {
        for (const token of extractPathLikeTokens(span)) {
          if (!isFileInsideExistingFolder(token, allFiles)) continue;
          const key = `${rule.file}:${line}:${token}`;
          if (seen.has(key) || fileExists(root, token)) continue;
          seen.add(key);
          const slash = token.indexOf("/");
          findings.push({
            check: "dead-path",
            file: rule.file,
            line,
            sentence: `Dead path: \`${token}\` — \`${token.slice(0, slash + 1)}\` exists but has no \`${token.slice(slash + 1)}\`.`,
            lookedFor: token,
          });
        }
      }
    }

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
