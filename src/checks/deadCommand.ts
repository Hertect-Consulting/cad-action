import { isAllowedFirstToken } from "../allowlist.js";
import { loadDefinedCommands, isDefined, type DefinedCommands } from "../definitions.js";
import { extractBacktickedCommands, firstToken, packageScriptInvocation } from "../scan.js";
import type { Finding, ParsedRule } from "../types.js";
import { headingBlockLines, scannableFields } from "./shared.js";

/**
 * A backticked `npm run X` (or npm test/start, pnpm run, yarn run) whose
 * script is not in package.json. Precise enough to run on prose too: the
 * probe over three real repos found two true hits and no false ones.
 */
function deadScriptFinding(rule: ParsedRule, text: string, line: number, defs: DefinedCommands): Finding[] {
  const out: Finding[] = [];
  for (const cmd of extractBacktickedCommands(text)) {
    const script = packageScriptInvocation(cmd);
    if (!script || defs.packageScripts.has(script)) continue;
    out.push({
      check: "dead-command",
      file: rule.file,
      line,
      sentence: `Dead command: \`${cmd}\` — package.json has no script named \`${script}\`.`,
      lookedFor: script,
    });
  }
  return out;
}

export function checkDeadCommand(root: string, rules: ParsedRule[], extraAllow: string[]): Finding[] {
  const defs = loadDefinedCommands(root);
  const findings: Finding[] = [];

  for (const rule of rules) {
    for (const { text, line } of headingBlockLines(rule)) {
      findings.push(...deadScriptFinding(rule, text, line, defs));
    }

    for (const field of scannableFields(rule)) {
      if (field.field === "appliesTo") continue; // spec: "a Check or What line"
      findings.push(...deadScriptFinding(rule, field.text, field.line, defs));
      for (const cmd of extractBacktickedCommands(field.text)) {
        if (packageScriptInvocation(cmd)) continue; // already judged above
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
