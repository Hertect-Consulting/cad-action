import type { CheckId, Finding, RunResult } from "./types.js";

/**
 * Enforcement of a company's own policy (Ctrl Alt Delegate build plan item 25).
 *
 * Optional. Given the two inputs, the Action asks Ctrl Alt Delegate for the company's policy,
 * read only, with the company's license credential, and fails the check only for a rule the
 * company enforces and this run observed. Without them nothing here runs and nothing is
 * requested. Ctrl Alt Delegate never decides what fails a pull request: with no company choice,
 * nothing is enforced.
 *
 * What this module never does: write to the repository or to GitHub, send anything about the
 * repository (the one request carries the credential and nothing else), read another repository,
 * or keep anything between runs. The policy is fetched on each run and held in memory.
 */

export const POLICY_PATH = "/api/action/policy";
export const POLICY_SCHEMA = "cad.action-policy.v1";
export const POLICY_TIMEOUT_MS = 10_000;

/**
 * The Action's own checks that restate a rule in the company's built in policy. The other three
 * (no Check line, no instruction file, contradiction) restate none, so a company policy never
 * fails on them. The keys are the rule keys Ctrl Alt Delegate publishes.
 */
export const RULE_FOR_CHECK: Partial<Record<CheckId, string>> = {
  "dead-command": "builtin.dead_command",
  "dead-path": "builtin.broken_repository_reference",
};

/** What the comment calls each rule the Action can observe. A rule not listed shows its key. */
const RULE_LABEL: Record<string, string> = {
  "builtin.dead_command": "Commands an instruction names are defined",
  "builtin.broken_repository_reference": "Paths an instruction names exist",
};

export interface Policy {
  policyKey: string;
  catalogueVersion: number;
  enforcementEnabled: boolean;
  settingsVersion: number;
  rules: Array<{ key: string; version: number; enforced: boolean }>;
}

export type PolicyFetch =
  | { status: "applied"; policy: Policy }
  | { status: "expired" | "invalid" | "unreachable" };

export type PolicyStatus = "not-configured" | "applied" | "enforcement-off" | "expired" | "invalid" | "unreachable";

export interface PolicyStep {
  status: PolicyStatus;
  /** One line for the log and the comment, or empty when nothing needs saying. */
  line: string;
  policy?: Policy;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">>;

/** The base URL with no path, query or credentials, or null. https only, except for a local address. */
export function policyUrl(baseUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}${POLICY_PATH}`;
}

function parsePolicy(body: unknown): Policy | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const policy = b.policy as Record<string, unknown> | undefined;
  const enforcement = b.enforcement as Record<string, unknown> | undefined;
  if (
    b.schema !== POLICY_SCHEMA ||
    !policy || typeof policy.key !== "string" || !Number.isSafeInteger(policy.catalogueVersion) ||
    !enforcement || typeof enforcement.enabled !== "boolean" || !Number.isSafeInteger(enforcement.settingsVersion) ||
    !Array.isArray(b.rules)
  ) {
    return null;
  }
  const rules: Policy["rules"] = [];
  for (const rule of b.rules) {
    const r = rule as Record<string, unknown> | null;
    if (!r || typeof r.key !== "string" || !Number.isSafeInteger(r.version) || typeof r.enforced !== "boolean") return null;
    rules.push({ key: r.key, version: r.version as number, enforced: r.enforced });
  }
  return {
    policyKey: policy.key,
    catalogueVersion: policy.catalogueVersion as number,
    enforcementEnabled: enforcement.enabled,
    settingsVersion: enforcement.settingsVersion as number,
    rules,
  };
}

/**
 * One GET. The credential is the bearer and the only thing sent. A redirect is refused so the
 * credential is never forwarded, a slow answer is abandoned, and any answer this does not
 * recognise is "unreachable" or "invalid", never a reason to fail the check.
 */
export async function fetchPolicy(
  baseUrl: string,
  credential: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs = POLICY_TIMEOUT_MS,
): Promise<PolicyFetch> {
  const url = policyUrl(baseUrl);
  if (!url) return { status: "unreachable" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${credential}`, accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status === 401) {
      let code: unknown;
      try {
        code = ((await response.json()) as { error?: unknown } | null)?.error;
      } catch {
        code = undefined;
      }
      return { status: code === "credential_expired" ? "expired" : "invalid" };
    }
    if (response.status === 403) return { status: "invalid" };
    if (!response.ok) return { status: "unreachable" };
    const policy = parsePolicy(await response.json());
    return policy ? { status: "applied", policy } : { status: "unreachable" };
  } catch {
    return { status: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

const LINES: Record<Exclude<PolicyStatus, "not-configured" | "applied" | "enforcement-off">, string> = {
  expired: "Company policy not applied: the license credential has expired. The built in checks ran as usual.",
  invalid: "Company policy not applied: Ctrl Alt Delegate did not accept the license credential. The built in checks ran as usual.",
  unreachable: "Company policy not applied: Ctrl Alt Delegate could not be reached or gave an answer this Action does not recognise. The built in checks ran as usual.",
};

/**
 * Decides whether and how the policy applies. With neither input set, nothing happens and no
 * request is made. With a URL and an empty credential (a pull request from a fork gets no
 * secrets) it says so and runs as before.
 */
export async function resolvePolicy(
  inputs: { credential: string; baseUrl: string },
  fetchImpl?: FetchLike,
  timeoutMs?: number,
): Promise<PolicyStep> {
  const credential = inputs.credential.trim();
  const baseUrl = inputs.baseUrl.trim();
  if (!credential && !baseUrl) return { status: "not-configured", line: "" };
  if (!credential || !baseUrl) {
    return {
      status: "not-configured",
      line: credential
        ? "Company policy not applied: the license credential is set but the Ctrl Alt Delegate address is not. The built in checks ran as usual."
        : "Company policy not applied: the license credential is empty, which is the case for pull requests from forks. The built in checks ran as usual.",
    };
  }
  const fetched = await fetchPolicy(baseUrl, credential, fetchImpl, timeoutMs);
  if (fetched.status !== "applied") return { status: fetched.status, line: LINES[fetched.status] };
  if (!fetched.policy.enforcementEnabled) {
    return {
      status: "enforcement-off",
      line: "Company policy read: your company has not turned enforcement on, so the built in checks ran as usual.",
      policy: fetched.policy,
    };
  }
  return { status: "applied", line: "", policy: fetched.policy };
}

export interface RuleEvaluation {
  key: string;
  label: string;
  /** False for an enforced rule none of this Action's checks restates. */
  checked: boolean;
  /** The findings that are evidence for the rule, empty when none. */
  findings: Finding[];
}

export interface PolicyEvaluation {
  rules: RuleEvaluation[];
  /** The findings that make the check conclusion failure: observed under an enforced rule. */
  enforced: Finding[];
}

/** Maps the Action's own findings to the enforced rules. Pure. */
export function evaluatePolicy(policy: Policy, findings: Finding[]): PolicyEvaluation {
  const enforcedKeys = policy.rules.filter((r) => r.enforced).map((r) => r.key);
  const observable = new Set(Object.values(RULE_FOR_CHECK));
  const rules = enforcedKeys.map((key) => ({
    key,
    label: RULE_LABEL[key] ?? key,
    checked: observable.has(key),
    findings: findings.filter((f) => RULE_FOR_CHECK[f.check] === key),
  }));
  return { rules, enforced: rules.flatMap((r) => r.findings) };
}

/** The check conclusion under the company's policy. Only an enforced rule that was observed gives failure. */
export function policyConclusion(evaluation: PolicyEvaluation): RunResult["conclusion"] {
  return evaluation.enforced.length > 0 ? "failure" : "success";
}

/** The comment section for a policy that was read. Words: observed, not observed. */
export function policyCommentLines(step: PolicyStep, evaluation?: PolicyEvaluation): string[] {
  if (step.status === "not-configured" && !step.line) return [];
  if (!evaluation || !step.policy) return step.line ? ["### Company policy", "", step.line, ""] : [];
  const lines = ["### Company policy", "", `Applied your company's policy from Ctrl Alt Delegate (settings version ${step.policy.settingsVersion}). Only the rules your company enforces are listed.`, ""];
  for (const rule of evaluation.rules) {
    const outcome = !rule.checked
      ? "not checked by this Action"
      : rule.findings.length === 0
        ? "not observed"
        : `observed ${rule.findings.length} time${rule.findings.length === 1 ? "" : "s"}`;
    lines.push(`- ${rule.label} (\`${rule.key}\`): ${outcome}`);
  }
  lines.push("");
  lines.push(
    evaluation.enforced.length > 0
      ? "An enforced rule was observed, so the check conclusion is failure."
      : "No enforced rule was observed, so the check conclusion is success.",
    "",
  );
  return lines;
}

export interface AppliedPolicy {
  step: PolicyStep;
  evaluation?: PolicyEvaluation;
  /** The check conclusion: the company's policy when it is applied, otherwise the one the checks already gave. */
  conclusion: RunResult["conclusion"];
  commentLines: string[];
}

/** The whole optional step, for one run: fetch, map, decide the conclusion, and say what happened. */
export async function applyCompanyPolicy(
  result: Pick<RunResult, "findings" | "conclusion">,
  inputs: { credential: string; baseUrl: string },
  fetchImpl?: FetchLike,
  timeoutMs?: number,
): Promise<AppliedPolicy> {
  const step = await resolvePolicy(inputs, fetchImpl, timeoutMs);
  const evaluation = step.status === "applied" && step.policy ? evaluatePolicy(step.policy, result.findings) : undefined;
  return {
    step,
    evaluation,
    conclusion: evaluation ? policyConclusion(evaluation) : result.conclusion,
    commentLines: policyCommentLines(step, evaluation),
  };
}
