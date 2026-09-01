import { resolve, sep } from 'node:path'

// The website documents the RunTypes monorepo. At build/dev time the code-import
// and twoslash mechanisms read first-party source + built .d.ts from
// <repoRoot>/packages.
//
// MION_REPO_ROOT points at the directory that CONTAINS `packages/`. It is set by
// scripts/website/site.mjs to the read-only-mounted repo context inside the container;
// when unset (host runs / tests) the caller's fallback keeps today's behaviour.
// This indirection makes the website merge-agnostic: the packages can live in a
// sibling checkout or be merged into this repo, only the env value changes,
// never the code.
export function getRepoRoot(fallback: string): string {
  return process.env.MION_REPO_ROOT ? resolve(process.env.MION_REPO_ROOT) : resolve(fallback)
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

// Documents outside packages/ that a content page may inline with
// <markdown-import>. An explicit ALLOWLIST, not a directory: docs/ also holds
// the internal planning trees (todos/, done/, investigations/), and a typo in a
// path should not be able to publish one of those. Adding a document here is a
// deliberate "this is public" decision, reviewable as a one-line diff.
//
// The key is what a page writes as `doc="..."`; the value is repo-root
// relative. No path from the content file ever reaches the filesystem, so
// traversal is not expressible.
export const IMPORTABLE_DOCS: Readonly<Record<string, string>> = {
  'json-schema-2020-12-javascript': 'docs/json-schema-2020-12-javascript.md',
}

/** Resolve an allowlisted document name to its absolute path. Throws on an
 *  unknown name, listing what IS importable. **/
export function resolveImportableDoc(root: string, name: string): string {
  const relative = IMPORTABLE_DOCS[name]
  if (!relative) {
    const known = Object.keys(IMPORTABLE_DOCS).join(', ')
    throw new Error(`Unknown document "${name}". Importable documents: ${known || '(none)'}`)
  }
  return resolve(root, relative)
}

// Read-only-mounted directory holding generated benchmark/test result JSON the
// docs are built from (scripts/website/site.mjs sets MION_DOCDATA=/app/.docdata).
// Empty string when unset so callers can detect "no results available".
export const DOCDATA_DIR = process.env.MION_DOCDATA ? resolve(process.env.MION_DOCDATA) : ''
