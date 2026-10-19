import type { DiscoveredFile, FileKind, Finding } from "../types.js";

interface KnownTool {
  tool: string;
  kinds: FileKind[];
  /** Where the file would be; reported as the finding's file since there is no line to point at. */
  path: string;
  /** What the tool reads, in the words a reader would use to create it. */
  reads: string;
}

/**
 * The tools the Action knows, and the file each one reads. A SKILL.md is
 * shared between tools and counts for none of them. A repository with no
 * file for a tool gives that tool nothing to follow, which is the quietest
 * way an instruction layer can be wrong.
 */
const KNOWN_TOOLS: KnownTool[] = [
  { tool: "Codex", kinds: ["AGENTS"], path: "AGENTS.md", reads: "AGENTS.md" },
  { tool: "Claude Code", kinds: ["CLAUDE"], path: "CLAUDE.md", reads: "CLAUDE.md" },
  {
    tool: "Cursor",
    kinds: ["CURSOR_MDC", "CURSORRULES"],
    path: ".cursor/rules",
    reads: ".cursor/rules/*.mdc or .cursorrules",
  },
  {
    tool: "Copilot",
    kinds: ["COPILOT"],
    path: ".github/copilot-instructions.md",
    reads: ".github/copilot-instructions.md",
  },
  { tool: "Gemini", kinds: ["GEMINI"], path: "GEMINI.md", reads: "GEMINI.md" },
];

export function checkNoInstructionFile(files: DiscoveredFile[]): Finding[] {
  const present = new Set(files.map((f) => f.kind));
  const findings: Finding[] = [];

  for (const { tool, kinds, path, reads } of KNOWN_TOOLS) {
    if (kinds.some((kind) => present.has(kind))) continue;
    findings.push({
      check: "no-file",
      file: path,
      line: 0,
      sentence: `No instruction file: ${tool} reads ${reads}, and this repository has none at the head commit.`,
    });
  }

  return findings;
}
