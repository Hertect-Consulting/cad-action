import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildComment } from "../src/comment.js";
import {
  POLICY_SCHEMA,
  RULE_FOR_CHECK,
  applyCompanyPolicy,
  evaluatePolicy,
  fetchPolicy,
  policyCommentLines,
  policyConclusion,
  policyUrl,
  resolvePolicy,
} from "../src/policy.js";
import type { CheckId, Finding, RunResult } from "../src/types.js";

const CREDENTIAL = "cadal1.secret-credential-value";
const BASE = "https://cad.example.com";

function policyBody(enforced: string[], enabled = true) {
  return {
    schema: POLICY_SCHEMA,
    policy: { key: "cad.builtin", catalogueVersion: 2 },
    enforcement: { enabled, settingsVersion: 3 },
    rules: [
      "builtin.dead_command",
      "builtin.broken_repository_reference",
      "builtin.unowned",
    ].map((key) => ({ key, version: 1, enforced: enabled && enforced.includes(key) })),
  };
}

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function finding(check: CheckId): Finding {
  return { check, file: "AGENTS.md", line: 3, sentence: "A sentence." };
}

describe("policyUrl", () => {
  it("builds the one path from an https base, keeping a base path", () => {
    expect(policyUrl("https://cad.example.com")).toBe("https://cad.example.com/api/action/policy");
    expect(policyUrl("https://cad.example.com/")).toBe("https://cad.example.com/api/action/policy");
    expect(policyUrl("https://example.com/cad/")).toBe("https://example.com/cad/api/action/policy");
  });
  it("refuses plain http except for a local address, and anything carrying credentials or a query", () => {
    expect(policyUrl("http://cad.example.com")).toBeNull();
    expect(policyUrl("http://localhost:3210")).toBe("http://localhost:3210/api/action/policy");
    expect(policyUrl("https://user:pass@cad.example.com")).toBeNull();
    expect(policyUrl("https://cad.example.com?x=1")).toBeNull();
    expect(policyUrl("not a url")).toBeNull();
    expect(policyUrl("")).toBeNull();
  });
});

describe("fetchPolicy", () => {
  it("makes one read only GET that carries the credential and nothing about the repository", async () => {
    const fetchImpl = vi.fn(async () => reply(200, policyBody(["builtin.dead_command"])));
    const result = await fetchPolicy(BASE, CREDENTIAL, fetchImpl);
    expect(result.status).toBe("applied");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://cad.example.com/api/action/policy");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.redirect).toBe("error");
    expect(Object.keys(init.headers as object).sort()).toEqual(["accept", "authorization"]);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${CREDENTIAL}`);
  });

  it("reads the policy", async () => {
    const result = await fetchPolicy(BASE, CREDENTIAL, async () => reply(200, policyBody(["builtin.dead_command"])));
    expect(result).toMatchObject({
      status: "applied",
      policy: { policyKey: "cad.builtin", catalogueVersion: 2, enforcementEnabled: true, settingsVersion: 3 },
    });
  });

  it("says expired and invalid apart", async () => {
    expect((await fetchPolicy(BASE, CREDENTIAL, async () => reply(401, { error: "credential_expired" }))).status).toBe("expired");
    expect((await fetchPolicy(BASE, CREDENTIAL, async () => reply(401, { error: "credential_invalid" }))).status).toBe("invalid");
    expect((await fetchPolicy(BASE, CREDENTIAL, async () => reply(401, null))).status).toBe("invalid");
    expect((await fetchPolicy(BASE, CREDENTIAL, async () => reply(403, {}))).status).toBe("invalid");
  });

  it.each([
    ["a server error", async () => reply(503, { error: "unavailable" })],
    ["a not found", async () => reply(404, {})],
    ["a network error", async () => { throw new TypeError("fetch failed"); }],
    ["a refused redirect", async () => { throw new TypeError("redirect mode is set to error"); }],
    ["a body that is not the policy", async () => reply(200, { hello: "world" })],
    ["a body with another schema", async () => reply(200, { ...policyBody([]), schema: "other" })],
    ["a rule of the wrong shape", async () => reply(200, { ...policyBody([]), rules: [{ key: 1 }] })],
    ["a body that is not JSON", async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } })],
  ])("is unreachable for %s", async (_name, fetchImpl) => {
    expect((await fetchPolicy(BASE, CREDENTIAL, fetchImpl)).status).toBe("unreachable");
  });

  it("abandons a slow answer", async () => {
    const slow = (_url: string, init: RequestInit) =>
      new Promise<never>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    expect((await fetchPolicy(BASE, CREDENTIAL, slow, 20)).status).toBe("unreachable");
  });

  it("makes no request for an address it refuses", async () => {
    const fetchImpl = vi.fn();
    expect((await fetchPolicy("http://cad.example.com", CREDENTIAL, fetchImpl)).status).toBe("unreachable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("resolvePolicy", () => {
  it("with neither input, requests nothing and says nothing", async () => {
    const fetchImpl = vi.fn();
    expect(await resolvePolicy({ credential: "", baseUrl: "" }, fetchImpl)).toEqual({ status: "not-configured", line: "" });
    expect(await resolvePolicy({ credential: "  ", baseUrl: " " }, fetchImpl)).toEqual({ status: "not-configured", line: "" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("with only one input, requests nothing and says why in one line", async () => {
    const fetchImpl = vi.fn();
    const fork = await resolvePolicy({ credential: "", baseUrl: BASE }, fetchImpl);
    const noUrl = await resolvePolicy({ credential: CREDENTIAL, baseUrl: "" }, fetchImpl);
    expect(fork.status).toBe("not-configured");
    expect(fork.line).toContain("forks");
    expect(noUrl.status).toBe("not-configured");
    expect(noUrl.line).toContain("address is not");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("applies a policy that has enforcement on", async () => {
    const step = await resolvePolicy({ credential: CREDENTIAL, baseUrl: BASE }, async () => reply(200, policyBody(["builtin.dead_command"])));
    expect(step.status).toBe("applied");
    expect(step.line).toBe("");
  });

  it("reads a policy that has enforcement off, and falls back to the built in checks", async () => {
    const step = await resolvePolicy({ credential: CREDENTIAL, baseUrl: BASE }, async () => reply(200, policyBody(["builtin.dead_command"], false)));
    expect(step.status).toBe("enforcement-off");
    expect(step.line).toContain("not turned enforcement on");
  });

  it.each([
    ["expired", async () => reply(401, { error: "credential_expired" }), "expired"],
    ["invalid", async () => reply(401, { error: "credential_invalid" }), "did not accept"],
    ["unreachable", async () => { throw new Error("down"); }, "could not be reached"],
  ] as const)("says %s in one clear line and falls back", async (status, fetchImpl, words) => {
    const step = await resolvePolicy({ credential: CREDENTIAL, baseUrl: BASE }, fetchImpl);
    expect(step.status).toBe(status);
    expect(step.line).toContain("Company policy not applied");
    expect(step.line).toContain(words);
    expect(step.line).toContain("built in checks ran as usual");
    expect(step.line).not.toContain("\n");
    expect(step.line).not.toContain(CREDENTIAL);
  });
});

describe("evaluatePolicy", () => {
  const policy = (enforced: string[]) => {
    const body = policyBody(enforced);
    return {
      policyKey: "cad.builtin", catalogueVersion: 2, enforcementEnabled: true, settingsVersion: 3,
      rules: body.rules,
    };
  };

  it("maps the Action's own checks to rules", () => {
    expect(RULE_FOR_CHECK).toEqual({
      "dead-command": "builtin.dead_command",
      "dead-path": "builtin.broken_repository_reference",
    });
  });

  it("fails only for an enforced rule that is observed", () => {
    const findings = [finding("dead-command"), finding("dead-command"), finding("dead-path")];
    const evaluation = evaluatePolicy(policy(["builtin.dead_command"]), findings);
    expect(evaluation.enforced).toHaveLength(2);
    expect(policyConclusion(evaluation)).toBe("failure");
  });

  it("does not fail for an observed rule the company does not enforce", () => {
    const evaluation = evaluatePolicy(policy(["builtin.broken_repository_reference"]), [finding("dead-command")]);
    expect(evaluation.enforced).toEqual([]);
    expect(policyConclusion(evaluation)).toBe("success");
  });

  it("does not fail for findings no rule restates, even with every rule enforced", () => {
    const evaluation = evaluatePolicy(
      policy(["builtin.dead_command", "builtin.broken_repository_reference", "builtin.unowned"]),
      [finding("no-check"), finding("no-file"), finding("contradiction")],
    );
    expect(policyConclusion(evaluation)).toBe("success");
  });

  it("does not fail an enforced rule that is not observed, and says a rule it cannot check is not checked", () => {
    const evaluation = evaluatePolicy(policy(["builtin.dead_command", "builtin.unowned"]), []);
    expect(policyConclusion(evaluation)).toBe("success");
    expect(evaluation.rules.map((r) => [r.key, r.checked])).toEqual([
      ["builtin.dead_command", true],
      ["builtin.unowned", false],
    ]);
  });
});

describe("the policy section of the comment", () => {
  const policy = {
    policyKey: "cad.builtin", catalogueVersion: 2, enforcementEnabled: true, settingsVersion: 3,
    rules: policyBody(["builtin.dead_command", "builtin.unowned"]).rules,
  };
  const step = { status: "applied" as const, line: "", policy };

  it("says observed, not observed and not checked, for the enforced rules only", () => {
    const evaluation = evaluatePolicy(policy, [finding("dead-command")]);
    const text = policyCommentLines(step, evaluation).join("\n");
    expect(text).toContain("Commands an instruction names are defined (`builtin.dead_command`): observed 1 time");
    expect(text).toContain("`builtin.unowned`): not checked by this Action");
    expect(text).not.toContain("broken_repository_reference");
    expect(text).toContain("the check conclusion is failure");
    const clear = policyCommentLines(step, evaluatePolicy(policy, [])).join("\n");
    expect(clear).toContain("`builtin.dead_command`): not observed");
    expect(clear).toContain("the check conclusion is success");
  });

  it("uses no pass, fail, violation or wrong, and no dash or hyphen, in what it says", () => {
    const lines = [
      ...policyCommentLines(step, evaluatePolicy(policy, [finding("dead-command")])),
      ...policyCommentLines(step, evaluatePolicy(policy, [])),
      ...policyCommentLines({ status: "expired", line: "Company policy not applied: the license credential has expired. The built in checks ran as usual." }),
    ];
    for (const line of lines) {
      // Rule keys and code spans are identifiers, not copy.
      const prose = line.replace(/^- /, "").replace(/`[^`]*`/g, "");
      expect(prose).not.toMatch(/\b(fail|failed|failing|pass|passed|passing|violation|wrong)\b/i);
      expect(prose).not.toMatch(/[-–—]/);
    }
  });

  it("writes nothing when the policy was not configured, and one line when it was refused", () => {
    expect(policyCommentLines({ status: "not-configured", line: "" })).toEqual([]);
    expect(policyCommentLines({ status: "invalid", line: "Company policy not applied: x." }).join("\n")).toContain("Company policy not applied: x.");
  });

  it("leaves the comment exactly as it was without a policy section", () => {
    const result: RunResult = {
      findings: [], ruleCount: 0, fileCount: 0, notes: [], instructionChanges: [], conclusion: "success",
      inventory: { fileCount: 0, ruleCount: 0, toolCount: 0, tools: [], ownedRuleCount: 0, reviewedRuleCount: 0 },
    };
    expect(buildComment(result, [])).toBe(buildComment(result));
    expect(buildComment(result, ["### Company policy", ""])).toContain("### Company policy");
  });
});

describe("what the Action does not gain", () => {
  it("action.yml asks for no permission and the policy module never writes or reads a repository", () => {
    const manifest = readFileSync(join(import.meta.dirname, "..", "action.yml"), "utf8");
    expect(manifest).not.toMatch(/permissions:/);
    const source = readFileSync(join(import.meta.dirname, "..", "src", "policy.ts"), "utf8");
    expect(source).not.toMatch(/from "node:(fs|child_process)"|@actions\/github|writeFile|octokit/);
    expect(source).not.toMatch(/localStorage|writeFileSync|\.cache/i);
  });
});

describe("applyCompanyPolicy, each path", () => {
  const failing: Pick<RunResult, "findings" | "conclusion"> = { findings: [finding("dead-command"), finding("no-check")], conclusion: "failure" };
  const clean: Pick<RunResult, "findings" | "conclusion"> = { findings: [finding("no-check")], conclusion: "failure" };
  const inputs = { credential: CREDENTIAL, baseUrl: BASE };

  it("not configured: today's conclusion, no request, no comment section", async () => {
    const fetchImpl = vi.fn();
    const applied = await applyCompanyPolicy(failing, { credential: "", baseUrl: "" }, fetchImpl);
    expect(applied.conclusion).toBe("failure");
    expect(applied.commentLines).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("valid credential: the company's policy decides, in both directions", async () => {
    const enforcing = async () => reply(200, policyBody(["builtin.dead_command"]));
    expect((await applyCompanyPolicy(failing, inputs, enforcing)).conclusion).toBe("failure");
    // The check's own result was failure for a finding no enforced rule restates; the policy says success.
    expect((await applyCompanyPolicy(clean, inputs, enforcing)).conclusion).toBe("success");
    // The company enforces a rule that was not observed.
    const other = async () => reply(200, policyBody(["builtin.broken_repository_reference"]));
    expect((await applyCompanyPolicy(failing, inputs, other)).conclusion).toBe("success");
  });

  it("enforcement off, expired, invalid, unreachable: today's conclusion and one line", async () => {
    const cases: Array<[string, Parameters<typeof applyCompanyPolicy>[2]]> = [
      ["enforcement-off", async () => reply(200, policyBody(["builtin.dead_command"], false))],
      ["expired", async () => reply(401, { error: "credential_expired" })],
      ["invalid", async () => reply(401, { error: "credential_invalid" })],
      ["unreachable", async () => { throw new Error("offline"); }],
    ];
    for (const [status, fetchImpl] of cases) {
      for (const run of [failing, { findings: [], conclusion: "success" as const }]) {
        const applied = await applyCompanyPolicy(run, inputs, fetchImpl);
        expect(applied.step.status).toBe(status);
        expect(applied.conclusion).toBe(run.conclusion);
        expect(applied.step.line).not.toBe("");
        expect(applied.commentLines.join("\n")).toContain(applied.step.line);
      }
    }
  });
});
