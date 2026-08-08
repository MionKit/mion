import { resolve, sep } from 'node:path'

// The website documents the RunTypes monorepo. At build/dev time the code-import
// and twoslash mechanisms read first-party source + built .d.ts from
// <repoRoot>/packages.
//
// RT_REPO_ROOT points at the directory that CONTAINS `packages/`. It is set by
// scripts/website/site.mjs to the read-only-mounted repo context inside the container;
// when unset (host runs / tests) the caller's fallback keeps today's behaviour.
// This indirection makes the website merge-agnostic: the packages can live in a
// sibling checkout or be merged into this repo, only the env value changes,
// never the code.
export function getRepoRoot(fallback: string): string {
  return process.env.RT_REPO_ROOT ? resolve(process.env.RT_REPO_ROOT) : resolve(fallback)
}

export function packagesDir(root: string): string {
  return resolve(root, 'packages')
}

// Resolve a user-supplied relative path (from a <code-import> / twoslash `path`)
// and HARD-FAIL if it escapes <root>/packages. This is the security boundary:
// the content mechanisms may only read code under packages/, never arbitrary
// repo files (configs, .env, lockfiles, node_modules, ...). Defends against
// `..` traversal and absolute paths alike.
export function resolveInPackages(root: string, relPath: string): string {
  const base = packagesDir(root)
  const abs = resolve(root, relPath)
  if (abs !== base && !abs.startsWith(base + sep)) {
    throw new Error(`Path outside packages/ is not allowed: ${relPath}`)
  }
  return abs
}

// Read-only-mounted directory holding generated benchmark/test result JSON the
// docs are built from (scripts/website/site.mjs sets RT_DOCDATA=/app/.docdata).
// Empty string when unset so callers can detect "no results available".
export const DOCDATA_DIR = process.env.RT_DOCDATA ? resolve(process.env.RT_DOCDATA) : ''
