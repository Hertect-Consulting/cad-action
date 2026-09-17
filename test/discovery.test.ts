import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverFiles } from "../src/discovery.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

describe("discoverFiles", () => {
  it("finds every discovery kind in the discovery-kinds fixture", () => {
    const files = discoverFiles(join(FIXTURES, "discovery-kinds"));
    const byKind = Object.fromEntries(files.map((f) => [f.kind, f.path]));

    expect(byKind.AGENTS).toBe("AGENTS.md");
    expect(byKind.CLAUDE).toBe("CLAUDE.md");
    expect(byKind.COPILOT).toBe(".github/copilot-instructions.md");
    expect(byKind.CURSOR_MDC).toBe(".cursor/rules/example.mdc");
    expect(byKind.CURSORRULES).toBe(".cursorrules");
    expect(byKind.GEMINI).toBe("GEMINI.md");
    expect(byKind.SKILL).toBe("nested/skills/SKILL.md");
    expect(files).toHaveLength(7);
  });

  it("follows one level of @import for CLAUDE.md", () => {
    const files = discoverFiles(join(FIXTURES, "discovery-kinds"));
    const claude = files.find((f) => f.kind === "CLAUDE");
    expect(claude?.importedFrom).toContain("Root rule");
  });

  it("expands extra path globs from the `paths` input", () => {
    const files = discoverFiles(join(FIXTURES, "clean"), { extraPaths: ["*.json"] });
    expect(files.some((f) => f.path === "package.json")).toBe(true);
  });

  it("does not walk into node_modules or .git", () => {
    const files = discoverFiles(join(FIXTURES, "clean"));
    expect(files.every((f) => !f.path.includes("node_modules"))).toBe(true);
  });
});
