import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import type { CheckId } from "../src/types.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

function findingsFor(fixture: string) {
  return run({
    root: join(FIXTURES, fixture),
    extraPaths: [],
    failOn: "all",
    extraAllowCommands: [],
  }).findings;
}

function byCheck(findings: { check: CheckId }[], check: CheckId) {
  return findings.filter((f) => f.check === check);
}

const ALL_FIXTURES = [
  "clean",
  "dead-command",
  "dead-path",
  "no-check",
  "contradiction-command",
  "contradiction-version",
];

describe("clean fixture", () => {
  it("has zero findings and a success conclusion", () => {
    const result = run({
      root: join(FIXTURES, "clean"),
      extraPaths: [],
      failOn: "all",
      extraAllowCommands: [],
    });
    expect(result.findings).toEqual([]);
    expect(result.conclusion).toBe("success");
  });
});

describe("check 1 — dead command", () => {
  it("fires on the dead-command fixture", () => {
    const findings = byCheck(findingsFor("dead-command"), "dead-command");
    expect(findings).toHaveLength(1);
    expect(findings[0].lookedFor).toBe("verify-instructions-for-real");
  });

  it("stays silent on the clean fixture", () => {
    expect(byCheck(findingsFor("clean"), "dead-command")).toEqual([]);
  });
});

describe("check 2 — dead path", () => {
  it("fires on the dead-path fixture", () => {
    const findings = byCheck(findingsFor("dead-path"), "dead-path");
    expect(findings).toHaveLength(1);
    expect(findings[0].lookedFor).toBe("docs/style-guide.md");
  });

  it("stays silent on the clean fixture", () => {
    expect(byCheck(findingsFor("clean"), "dead-path")).toEqual([]);
  });
});

describe("check 3 — no Check line", () => {
  it("fires on both the five-line and heading-block cases in the no-check fixture", () => {
    const findings = byCheck(findingsFor("no-check"), "no-check");
    expect(findings).toHaveLength(2);
    expect(findings.some((f) => f.file === "AGENTS.md")).toBe(true);
    expect(findings.some((f) => f.file === "GEMINI.md")).toBe(true);
  });

  it("stays silent on the clean fixture", () => {
    expect(byCheck(findingsFor("clean"), "no-check")).toEqual([]);
  });
});

describe("check 4 — contradiction, narrow", () => {
  it("fires on the command-contradiction fixture", () => {
    const findings = byCheck(findingsFor("contradiction-command"), "contradiction");
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.some((f) => f.file === "AGENTS.md")).toBe(true);
    expect(findings.some((f) => f.file === "GEMINI.md")).toBe(true);
  });

  it("fires on the version-contradiction fixture", () => {
    const findings = byCheck(findingsFor("contradiction-version"), "contradiction");
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.some((f) => f.file === "AGENTS.md")).toBe(true);
    expect(findings.some((f) => f.file === ".github/copilot-instructions.md")).toBe(true);
  });

  it("fires on the two contradiction fixtures only", () => {
    const others = ALL_FIXTURES.filter((f) => !f.startsWith("contradiction"));
    for (const fixture of others) {
      expect(byCheck(findingsFor(fixture), "contradiction"), fixture).toEqual([]);
    }
  });
});

describe("fail-on input", () => {
  it("none never fails", () => {
    const result = run({
      root: join(FIXTURES, "dead-command"),
      extraPaths: [],
      failOn: "none",
      extraAllowCommands: [],
    });
    expect(result.conclusion).toBe("success");
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("dead-only ignores no-check and contradiction findings", () => {
    const result = run({
      root: join(FIXTURES, "no-check"),
      extraPaths: [],
      failOn: "dead-only",
      extraAllowCommands: [],
    });
    expect(result.conclusion).toBe("success");
  });

  it("all fails when any finding exists", () => {
    const result = run({
      root: join(FIXTURES, "dead-path"),
      extraPaths: [],
      failOn: "all",
      extraAllowCommands: [],
    });
    expect(result.conclusion).toBe("failure");
  });
});

describe("allow-commands input", () => {
  it("silences a dead-command finding for an explicitly allowed token", () => {
    const result = run({
      root: join(FIXTURES, "dead-command"),
      extraPaths: [],
      failOn: "all",
      extraAllowCommands: ["verify-instructions-for-real"],
    });
    expect(byCheck(result.findings, "dead-command")).toEqual([]);
  });
});
