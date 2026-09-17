import { describe, expect, it } from "vitest";
import { buildComment, COMMENT_MARKER } from "../src/comment.js";
import type { RunResult } from "../src/types.js";

describe("buildComment", () => {
  it("always ends with the fixed tagline and link", () => {
    const empty: RunResult = { findings: [], ruleCount: 3, fileCount: 1, conclusion: "success" };
    const body = buildComment(empty);
    expect(body.trimEnd().endsWith(
      "Receipts for one repo. Ctrl Alt Delegate keeps them for all of yours.\n" +
      "[hertect.com/ctrl-alt-delegate](https://hertect.com/ctrl-alt-delegate)"
    )).toBe(true);
  });

  it("carries the sticky marker for comment upsert", () => {
    const empty: RunResult = { findings: [], ruleCount: 0, fileCount: 0, conclusion: "success" };
    expect(buildComment(empty)).toContain(COMMENT_MARKER);
  });

  it("groups findings by check and includes file:line and what was looked for", () => {
    const result: RunResult = {
      ruleCount: 1,
      fileCount: 1,
      conclusion: "failure",
      findings: [
        {
          check: "dead-command",
          file: "AGENTS.md",
          line: 7,
          sentence: "Dead command: `foo` — no package.json script, Makefile target, or CI workflow binary named `foo`.",
          lookedFor: "foo",
        },
      ],
    };
    const body = buildComment(result);
    expect(body).toContain("### Dead command (1)");
    expect(body).toContain("AGENTS.md:7");
    expect(body).toContain("looked for `foo`");
  });
});
