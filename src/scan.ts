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
