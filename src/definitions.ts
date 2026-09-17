import { fileExists, listFiles, readRepoFile } from "./fs-walk.js";

export interface DefinedCommands {
  packageScripts: Set<string>;
  makeTargets: Set<string>;
  ciWorkflowText: string;
}

function readPackageScripts(root: string): Set<string> {
  if (!fileExists(root, "package.json")) return new Set();
  try {
    const pkg = JSON.parse(readRepoFile(root, "package.json"));
    return new Set(Object.keys(pkg.scripts ?? {}));
  } catch {
    return new Set();
  }
}

function readMakeTargets(root: string): Set<string> {
  const targets = new Set<string>();
  for (const name of ["Makefile", "makefile"]) {
    if (!fileExists(root, name)) continue;
    const content = readRepoFile(root, name);
    for (const line of content.split(/\r?\n/)) {
      const m = /^([A-Za-z0-9_.\-\/]+)\s*:(?!=)/.exec(line);
      if (m && !m[1].startsWith(".")) targets.add(m[1]);
      const phony = /^\.PHONY:\s*(.*)$/.exec(line.trim());
      if (phony) {
        for (const t of phony[1].split(/\s+/)) if (t) targets.add(t);
      }
    }
  }
  return targets;
}

function readCiWorkflowText(root: string): string {
  const files = listFiles(root).filter(
    (p) => p.startsWith(".github/workflows/") && /\.(ya?ml)$/.test(p),
  );
  return files.map((p) => readRepoFile(root, p)).join("\n");
}

export function loadDefinedCommands(root: string): DefinedCommands {
  return {
    packageScripts: readPackageScripts(root),
    makeTargets: readMakeTargets(root),
    ciWorkflowText: readCiWorkflowText(root),
  };
}

export function isDefined(token: string, defs: DefinedCommands): boolean {
  if (defs.packageScripts.has(token)) return true;
  if (defs.makeTargets.has(token)) return true;
  const wordBoundary = new RegExp(`(?<![\\w.-])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`);
  return wordBoundary.test(defs.ciWorkflowText);
}
