import { fileExists, listFiles, readRepoFile } from "./fs-walk.js";

export interface DefinedCommands {
  packageScripts: Set<string>;
  /** Names of dependencies and devDependencies: `prisma`, `eslint`, `wrangler` are binaries a repo installs. */
  packageDependencies: Set<string>;
  makeTargets: Set<string>;
  ciWorkflowText: string;
}

function readPackageJson(root: string): Record<string, Record<string, string>> {
  if (!fileExists(root, "package.json")) return {};
  try {
    return JSON.parse(readRepoFile(root, "package.json"));
  } catch {
    return {};
  }
}

function readPackageScripts(pkg: Record<string, Record<string, string>>): Set<string> {
  return new Set(Object.keys(pkg.scripts ?? {}));
}

/**
 * Every package.json in the repository counts, not only the root one: in a
 * workspace the binary a rule names is usually installed by one package.
 */
function readPackageDependencies(root: string): Set<string> {
  const names = new Set<string>();
  const manifests = listFiles(root).filter((p) => p === "package.json" || p.endsWith("/package.json"));
  for (const path of manifests) {
    let pkg: Record<string, Record<string, string>>;
    try {
      pkg = JSON.parse(readRepoFile(root, path));
    } catch {
      continue;
    }
    for (const name of [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]) {
      names.add(name);
    }
  }
  return names;
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
    packageScripts: readPackageScripts(readPackageJson(root)),
    packageDependencies: readPackageDependencies(root),
    makeTargets: readMakeTargets(root),
    ciWorkflowText: readCiWorkflowText(root),
  };
}

export function isDefined(token: string, defs: DefinedCommands): boolean {
  if (defs.packageScripts.has(token)) return true;
  if (defs.packageDependencies.has(token)) return true;
  if (defs.makeTargets.has(token)) return true;
  const wordBoundary = new RegExp(`(?<![\\w.-])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`);
  return wordBoundary.test(defs.ciWorkflowText);
}
