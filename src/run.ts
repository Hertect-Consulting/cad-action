import { checkContradiction } from "./checks/contradiction.js";
import { checkDeadCommand } from "./checks/deadCommand.js";
import { checkDeadPath } from "./checks/deadPath.js";
import { checkNoCheckLine } from "./checks/noCheck.js";
import { discoverFiles } from "./discovery.js";
import { parseFiles } from "./parser.js";
import type { Finding, RunOptions, RunResult } from "./types.js";

export function run(options: RunOptions): RunResult {
  const files = discoverFiles(options.root, { extraPaths: options.extraPaths });
  const rules = parseFiles(files);

  const findings: Finding[] = [
    ...checkDeadCommand(options.root, rules, options.extraAllowCommands),
    ...checkDeadPath(options.root, rules),
    ...checkNoCheckLine(rules),
    ...checkContradiction(rules),
  ];

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  const gating =
    options.failOn === "none"
      ? []
      : options.failOn === "dead-only"
        ? findings.filter((f) => f.check === "dead-command" || f.check === "dead-path")
        : findings;

  return {
    findings,
    ruleCount: rules.length,
    fileCount: files.length,
    conclusion: gating.length > 0 ? "failure" : "success",
  };
}
