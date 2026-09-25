import * as github from "@actions/github";
import { afterEach, describe, expect, it } from "vitest";
import { isForkPullRequest } from "../src/index.js";

function setPullRequestPayload(pr: unknown) {
  (github.context as unknown as { payload: Record<string, unknown> }).payload = { pull_request: pr };
}

describe("isForkPullRequest", () => {
  afterEach(() => {
    setPullRequestPayload(undefined);
  });

  it("is false outside a pull_request event", () => {
    setPullRequestPayload(undefined);
    expect(isForkPullRequest()).toBe(false);
  });

  it("is false when head and base repos match", () => {
    setPullRequestPayload({
      head: { repo: { full_name: "Hertect-Consulting/cad-action" } },
      base: { repo: { full_name: "Hertect-Consulting/cad-action" } },
    });
    expect(isForkPullRequest()).toBe(false);
  });

  it("is true when the head repo is a fork", () => {
    setPullRequestPayload({
      head: { repo: { full_name: "someone-else/cad-action" } },
      base: { repo: { full_name: "Hertect-Consulting/cad-action" } },
    });
    expect(isForkPullRequest()).toBe(true);
  });
});
