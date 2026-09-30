/** Extracts every backticked span from a line/text, e.g. "run `npm test` now" -> ["npm test"]. */
export function extractBacktickedCommands(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const cmd = m[1].trim();
    if (cmd) out.push(cmd);
  }
  return out;
}

export function firstToken(command: string): string {
  return command.trim().split(/\s+/)[0] ?? "";
}

/**
 * If `command` invokes a package.json script, returns the script name;
 * otherwise null. Recognises `npm run X`, `npm run-script X`, `npm test`,
 * `npm start`, `pnpm run X`, and `yarn run X`. The bare `pnpm X` / `yarn X`
 * forms are left alone on purpose: `yarn install` is not a script.
 */
export function packageScriptInvocation(command: string): string | null {
  const parts = command.trim().split(/\s+/);
  const [tool, sub, name] = parts;
  if (!tool || !sub) return null;
  const t = tool.replace(/^\.\//, "").toLowerCase();
  if (t === "npm" && (sub === "test" || sub === "start")) return sub;
  if ((t === "npm" || t === "pnpm" || t === "yarn") && (sub === "run" || sub === "run-script")) {
    if (!name || name.startsWith("-")) return null;
    return name;
  }
  return null;
}

const URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const PATH_LIKE_RE = /^[.\w][\w.\-/*]*$/;

/**
 * Extracts path-like tokens from free text: backticked spans, and bare
 * words that look like a file path or glob (contain a `/`, or an
 * extension, or a `*`). Deliberately excludes bare version numbers like
 * "3.11" and URLs.
 */
export function extractPathLikeTokens(text: string): string[] {
  if (!text) return [];
  const candidates = new Set<string>();

  const backticked = extractBacktickedCommands(text);
  for (const b of backticked) {
    for (const word of b.split(/\s+/)) candidates.add(word);
  }

  const plain = text.replace(/`[^`]*`/g, " ");
  for (const raw of plain.split(/\s+/)) {
    const word = raw.replace(/^[,;:()]+|[,;:()]+$/g, "");
    if (word) candidates.add(word);
  }

  const results: string[] = [];
  for (const token of candidates) {
    if (!token || URL_RE.test(token)) continue;
    if (!PATH_LIKE_RE.test(token)) continue;
    const hasSlash = token.includes("/");
    const hasGlob = token.includes("*");
    const hasExtension = /\.[A-Za-z0-9]{1,8}$/.test(token) && !/^\d+(\.\d+){1,2}$/.test(token);
    if (hasSlash || hasGlob || hasExtension) {
      results.push(token);
    }
  }
  return results;
}
