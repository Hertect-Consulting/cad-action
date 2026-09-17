import type { CheckId, Finding, RunResult } from "./types.js";

export const COMMENT_MARKER = "<!-- ctrl-alt-delegate-action:sticky-comment -->";

const CHECK_ORDER: CheckId[] = ["dead-command", "dead-path", "no-check", "contradiction"];
const CHECK_LABEL: Record<CheckId, string> = {
  "dead-command": "Dead command",
  "dead-path": "Dead path",
  "no-check": "No Check line",
  contradiction: "Contradiction",
};

const TAGLINE = "Receipts for one repo. Ctrl Alt Delegate keeps them for all of yours.";
const TAGLINE_LINK = "[hertect.com/ctrl-alt-delegate](https://hertect.com/ctrl-alt-delegate)";

export function buildComment(result: RunResult): string {
  const lines: string[] = [COMMENT_MARKER, "## Ctrl Alt Delegate", ""];

  if (result.findings.length === 0) {
    lines.push(
      `No findings across ${result.ruleCount} rule(s) in ${result.fileCount} file(s).`,
      "",
    );
  } else {
    for (const check of CHECK_ORDER) {
      const items = result.findings.filter((f) => f.check === check);
      if (items.length === 0) continue;
      lines.push(`### ${CHECK_LABEL[check]} (${items.length})`, "");
      for (const f of items) {
        lines.push(formatFindingLine(f));
      }
      lines.push("");
    }
  }

  lines.push(TAGLINE);
  lines.push(TAGLINE_LINK);
  return lines.join("\n");
}

function formatFindingLine(f: Finding): string {
  const lookedFor = f.lookedFor ? ` — looked for \`${f.lookedFor}\`` : "";
  return `- \`${f.file}:${f.line}\` — ${f.sentence}${lookedFor}`;
}
