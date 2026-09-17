export type FileKind =
  | "AGENTS"
  | "CLAUDE"
  | "COPILOT"
  | "CURSOR_MDC"
  | "CURSORRULES"
  | "GEMINI"
  | "SKILL";

export interface DiscoveredFile {
  path: string; // repo-relative, forward slashes
  kind: FileKind;
  content: string;
  /** For CLAUDE.md: the content of the file it `@import`s, appended for parsing. */
  importedFrom?: string;
}

export type RuleShape = "five-line" | "heading" | "skill";

export interface ParsedRule {
  file: string;
  kind: FileKind;
  shape: RuleShape;
  title: string;
  titleLine: number;

  whatText?: string;
  whatLine?: number;
  appliesToText?: string;
  appliesToLine?: number;
  checkText?: string;
  checkLine?: number;
  owner?: string;
  reviewed?: string;

  /** Full block text, used by heading-block scanning (checks 1-3). */
  bodyText: string;
  bodyStartLine: number;
}

export type CheckId = "dead-command" | "dead-path" | "no-check" | "contradiction";

export interface Finding {
  check: CheckId;
  file: string;
  line: number;
  sentence: string;
  lookedFor?: string;
}

export interface RunOptions {
  root: string;
  extraPaths: string[];
  failOn: "all" | "none" | "dead-only";
  extraAllowCommands: string[];
}

export interface RunResult {
  findings: Finding[];
  ruleCount: number;
  fileCount: number;
  conclusion: "success" | "failure";
}
