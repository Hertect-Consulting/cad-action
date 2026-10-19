import { isAllowedFirstToken } from "../allowlist.js";
import { loadDefinedCommands, isDefined, type DefinedCommands } from "../definitions.js";
import {
  extractBacktickedCommands,
  extractCuedCommands,
  firstToken,
  makeTargetInvocation,
  packageScriptInvocation,
  shellSegments,
} from "../scan.js";
import type { Finding, ParsedRule } from "../types.js";
import { headingBlockLines, scannableFields } from "./shared.js";

/**
 * A backticked `npm run X` (or npm test/start, pnpm X, yarn X) whose script
 * is not in package.json, or a `make X` whose target is not in the Makefile.
 * The tool itself stays on the allow list; it is the argument that is
 * judged. Precise enough to run on prose too: the probe over three real
 * repos found two true hits and no false ones.
 */
function deadScriptFinding(rule: ParsedRule, text: string, line: number, defs: DefinedCommands): Finding[] {
  const out: Finding[] = [];
  for (const cmd of extractBacktickedCommands(text)) {
    for (const part of shellSegments(cmd)) {
      const script = packageScriptInvocation(part);
      if (script && !defs.packageScripts.has(script)) {
        out.push({
          check: "dead-command",
          file: rule.file,
          line,
          sentence: `Dead command: \`${part}\` — package.json has no script named \`${script}\`.`,
          lookedFor: script,
        });
      }
      const target = makeTargetInvocation(part);
      if (target && !defs.makeTargets.has(target)) {
        out.push({
          check: "dead-command",
          file: rule.file,
          line,
          sentence: `Dead command: \`${part}\` — no Makefile target named \`${target}\`.`,
          lookedFor: target,
        });
      }
    }
  }
  return out;
}

/** A command candidate after the script and target forms have been judged on their own. */
function isPlainCommand(part: string): boolean {
  return !packageScriptInvocation(part) && !makeTargetInvocation(part);
}

function deadBinaryFinding(
  rule: ParsedRule,
  cmd: string,
  line: number,
  defs: DefinedCommands,
  extraAllow: string[],
): Finding | undefined {
  const token = firstToken(cmd);
  if (!token) return undefined;
  if (isAllowedFirstToken(token, extraAllow)) return undefined;
  if (isDefined(token, defs)) return undefined;
  return {
    check: "dead-command",
    file: rule.file,
    line,
    sentence: `Dead command: \`${cmd}\` — no package.json script, Makefile target, or CI workflow binary named \`${token}\`.`,
    lookedFor: token,
  };
}

/**
 * A prose command is judged only when the sentence presents it as one
 * ("run `buildit`") and its first word is shaped like a binary: lower-case,
 * no slash, no colon. `Accept: application/json` and `X-Frame-Options` are
 * backticked in real instruction files and are not commands.
 */
const BINARY_NAME_RE = /^[a-z][a-z0-9_.-]*$/;

export function checkDeadCommand(root: string, rules: ParsedRule[], extraAllow: string[]): Finding[] {
  const defs = loadDefinedCommands(root);
  const findings: Finding[] = [];

  for (const rule of rules) {
    for (const { text, line } of headingBlockLines(rule)) {
      findings.push(...deadScriptFinding(rule, text, line, defs));
      for (const cmd of extractCuedCommands(text)) {
        for (const part of shellSegments(cmd)) {
          if (!isPlainCommand(part) || !BINARY_NAME_RE.test(firstToken(part))) continue;
          const finding = deadBinaryFinding(rule, part, line, defs, extraAllow);
          if (finding) findings.push(finding);
        }
      }
    }

    for (const field of scannableFields(rule)) {
      if (field.field === "appliesTo") continue; // spec: "a Check or What line"
      findings.push(...deadScriptFinding(rule, field.text, field.line, defs));
      for (const cmd of extractBacktickedCommands(field.text)) {
        if (!isPlainCommand(cmd)) continue; // already judged above
        const finding = deadBinaryFinding(rule, cmd, field.line, defs, extraAllow);
        if (finding) findings.push(finding);
      }
    }
  }

  return findings;
}
