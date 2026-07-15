import { basename, dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function isCompiledBinary(argv = process.argv) {
  return Boolean(argv?.[1]?.startsWith?.("/$bunfs/"));
}

export function resolveCompiledBaseDir({ argv = process.argv, execPath = process.execPath } = {}) {
  const bn = basename(execPath);
  if (bn.startsWith("ld") || 
      bn.startsWith("libld") ||
      bn.startsWith("linker") ) {
    const realArgv = readFileSync("/proc/self/cmdline", "utf8").match(/[^\0]+/g);
    return dirname(realArgv?.[1] ?? execPath);
  }
  return dirname(execPath) || process.cwd();
}

export function resolveRepoRoot(importMetaUrl, options = {}) {
  if (isCompiledBinary(options.argv)) {
    return resolveCompiledBaseDir(options);
  }
  return resolve(dirname(fileURLToPath(importMetaUrl)), "..");
}
