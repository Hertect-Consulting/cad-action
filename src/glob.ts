// Minimal dependency-free glob matching. Supports `**`, `*`, `?` and literal
// path segments. No external glob package, per the build brief's runtime
// dependency limit (@actions/core and @actions/github only).

function globToRegExp(pattern: string): RegExp {
  let out = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        // `**` matches any number of path segments, including none.
        let j = i + 2;
        if (pattern[j] === "/") j++;
        out += "(?:.*/)?";
        i = j - 1;
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
  }
  out += "$";
  return new RegExp(out);
}

/** Returns true if `relPath` (repo-relative, forward slashes) matches `pattern`. */
export function globMatch(pattern: string, relPath: string): boolean {
  const normPattern = pattern.replace(/^\.\//, "");
  const normPath = relPath.replace(/^\.\//, "");
  return globToRegExp(normPattern).test(normPath);
}

/** Filters `allPaths` (repo-relative) to those matching `pattern`. */
export function globExpand(pattern: string, allPaths: string[]): string[] {
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return allPaths.filter((p) => p === pattern.replace(/^\.\//, ""));
  }
  return allPaths.filter((p) => globMatch(pattern, p));
}
