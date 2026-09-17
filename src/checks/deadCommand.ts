import { isAllowedFirstToken } from "../allowlist.js";
import { loadDefinedCommands, isDefined } from "../definitions.js";
import { extractBacktickedCommands, firstToken } from "../scan.js";
import type { Finding, ParsedRule } from "../types.js";
import { scannableFields } from "./shared.js";

export function checkDeadCommand(root: string, rules: ParsedRule[], extraAllow: string[]): Finding[] {
  const defs = loadDefinedCommands(root);
  const findings: Finding[] = [];

  for (const rule of rules) {
    for (const field of scannableFields(rule)) {
      if (field.field === "appliesTo") continue; // spec: "a Check or What line"
      for (const cmd of extractBacktickedCommands(field.text)) {
        const token = firstToken(cmd);
        if (!token) continue;
        if (isAllowedFirstToken(token, extraAllow)) continue;
        if (isDefined(token, defs)) continue;
        findings.push({
          check: "dead-command",
          file: rule.file,
          line: field.line,
          sentence: `Dead command: \`${cmd}\` — no package.json script, Makefile target, or CI workflow binary named \`${token}\`.`,
          lookedFor: token,
        });
      }
    }
  }

  return findings;
}
