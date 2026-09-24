import type { DiscoveredFile, FileKind, Inventory, InventoryTool, ParsedRule } from "./types.js";

/**
 * The label a reader recognises, not the internal kind. "Cursor rules" rather
 * than CURSOR_MDC, because this line is read by someone deciding whether the
 * Action understood their repository.
 */
const TOOL_LABEL: Record<FileKind, string> = {
  AGENTS: "AGENTS.md",
  CLAUDE: "CLAUDE.md",
  COPILOT: "Copilot instructions",
  CURSOR_MDC: "Cursor rules",
  CURSORRULES: ".cursorrules",
  GEMINI: "GEMINI.md",
  SKILL: "SKILL.md",
};

/** Fixed so the same repository always renders the same line. */
const TOOL_ORDER: FileKind[] = [
  "AGENTS",
  "CLAUDE",
  "COPILOT",
  "CURSOR_MDC",
  "CURSORRULES",
  "GEMINI",
  "SKILL",
];

/**
 * What exists, counted from what was already discovered and parsed. This adds
 * no file reads and no parsing of its own: `files` and `rules` are the same
 * values the checks ran against, so the inventory cannot disagree with them.
 *
 * Ownership and review are counted as "recorded", never as "current". Whether a
 * review is still valid needs the history this Action deliberately does not
 * keep, so the count says how many rules carry the line and stops there.
 */
export function buildInventory(files: DiscoveredFile[], rules: ParsedRule[]): Inventory {
  const byKind = new Map<FileKind, number>();
  for (const file of files) {
    byKind.set(file.kind, (byKind.get(file.kind) ?? 0) + 1);
  }

  const tools: InventoryTool[] = TOOL_ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
    kind,
    label: TOOL_LABEL[kind],
    fileCount: byKind.get(kind) as number,
  }));

  return {
    fileCount: files.length,
    ruleCount: rules.length,
    toolCount: tools.length,
    tools,
    ownedRuleCount: rules.filter((r) => Boolean(r.owner?.trim())).length,
    reviewedRuleCount: rules.filter((r) => Boolean(r.reviewed?.trim())).length,
  };
}
