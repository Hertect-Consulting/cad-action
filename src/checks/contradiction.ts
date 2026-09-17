import { extractBacktickedCommands } from "../scan.js";
import type { Finding, ParsedRule } from "../types.js";
import { scannableFields } from "./shared.js";

// v1, narrow, nothing semantic: keyed purely by script-name family / tool name.
const FAMILIES: { key: string; re: RegExp }[] = [
  { key: "test", re: /\btests?\b/i },
  { key: "lint", re: /\blint\b/i },
  { key: "build", re: /\bbuild\b/i },
  { key: "typecheck", re: /\btypecheck\b|\btype-check\b|\btsc\b/i },
];

function familyOf(command: string): string | undefined {
  return FAMILIES.find((f) => f.re.test(command))?.key;
}

interface CommandEntry {
  file: string;
  line: number;
  command: string; // normalized whitespace
}

function checkCommandContradictions(rules: ParsedRule[]): Finding[] {
  const byFamily = new Map<string, CommandEntry[]>();

  for (const rule of rules) {
    for (const field of scannableFields(rule)) {
      if (field.field !== "check") continue;
      for (const cmd of extractBacktickedCommands(field.text)) {
        const family = familyOf(cmd);
        if (!family) continue;
        const normalized = cmd.trim().replace(/\s+/g, " ");
        const list = byFamily.get(family) ?? [];
        list.push({ file: rule.file, line: field.line, command: normalized });
        byFamily.set(family, list);
      }
    }
  }

  const findings: Finding[] = [];
  for (const [family, entries] of byFamily) {
    for (const entry of entries) {
      const conflicting = entries.filter(
        (o) => o.file !== entry.file && o.command !== entry.command,
      );
      if (conflicting.length === 0) continue;
      const others = [...new Set(conflicting.map((o) => `\`${o.command}\` (${o.file})`))].join(", ");
      findings.push({
        check: "contradiction",
        file: entry.file,
        line: entry.line,
        sentence: `Contradiction: the ${family} Check here is \`${entry.command}\`, but ${others} says otherwise.`,
      });
    }
  }
  return findings;
}

interface VersionEntry {
  file: string;
  line: number;
  tool: string;
  version: string;
}

const VERSION_RE = /\b(Node(?:\.js)?|Python|Go)\b\s*v?(\d+(?:\.\d+){0,2})\b/gi;

function normalizeTool(name: string): string {
  return name.toLowerCase().replace(/\.js$/, "");
}

function checkVersionContradictions(rules: ParsedRule[]): Finding[] {
  const byTool = new Map<string, VersionEntry[]>();

  for (const rule of rules) {
    for (const field of scannableFields(rule)) {
      if (field.field === "appliesTo") continue;
      let m: RegExpExecArray | null;
      VERSION_RE.lastIndex = 0;
      while ((m = VERSION_RE.exec(field.text))) {
        const tool = normalizeTool(m[1]);
        const list = byTool.get(tool) ?? [];
        list.push({ file: rule.file, line: field.line, tool, version: m[2] });
        byTool.set(tool, list);
      }
    }
  }

  const findings: Finding[] = [];
  for (const [tool, entries] of byTool) {
    for (const entry of entries) {
      const conflicting = entries.filter(
        (o) => o.file !== entry.file && o.version !== entry.version,
      );
      if (conflicting.length === 0) continue;
      const others = [...new Set(conflicting.map((o) => `${o.version} (${o.file})`))].join(", ");
      findings.push({
        check: "contradiction",
        file: entry.file,
        line: entry.line,
        sentence: `Contradiction: this file states ${tool} ${entry.version}, but ${others} says otherwise.`,
      });
    }
  }
  return findings;
}

export function checkContradiction(rules: ParsedRule[]): Finding[] {
  return [...checkCommandContradictions(rules), ...checkVersionContradictions(rules)];
}
