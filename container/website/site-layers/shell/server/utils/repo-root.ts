import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

/** The `examples` key of a site's `website.config.json`: every path is relative to the repo root. */
interface ExampleTool {
  /** Folder of a first-party package and the published name its examples import. */
  packages: { dir: string, name: string }[]
  /** Folders the API endpoints serve, the dev watcher watches and twoslash loads for relative imports. */
  exampleDirs: string[]
  /** Folders a `<code-import>` may read. */
  readRoots: string[]
  /** Third-party packages whose types twoslash mounts from `<repoRoot>/node_modules`. */
  externalDeps: string[]
  /** Name a page writes in `<markdown-import doc="...">` and the file it inlines. */
  importableDocs: Record<string, string>
}

/** What the example tool needs at build time and in the server routes. */
export interface ExampleToolContext extends ExampleTool {
  /** The directory the config paths resolve from (the mounted repo context in the container). */
  repoRoot: string
}

const CONFIG_FILE = 'website.config.json'

/** The example tool of the site at `siteRoot`. A site without a config file gets an empty tool. */
export function loadExampleTool(siteRoot: string): ExampleToolContext {
  // scripts/website/site.mjs mounts the config file at the site root.
  const configPath = join(siteRoot, CONFIG_FILE)
  const examples: Partial<ExampleTool> = existsSync(configPath) ? (JSON.parse(readFileSync(configPath, 'utf-8')).examples ?? {}) : {}
  // MION_REPO_ROOT is the read-only repo mount scripts/website/site.mjs sets in the container.
  const repoRoot = process.env.MION_REPO_ROOT ? resolve(process.env.MION_REPO_ROOT) : siteRoot
  return {
    repoRoot,
    packages: examples.packages ?? [],
    exampleDirs: examples.exampleDirs ?? [],
    readRoots: examples.readRoots ?? [],
    externalDeps: examples.externalDeps ?? [],
    importableDocs: examples.importableDocs ?? {},
  }
}

/** True when `abs` is `dir` or sits inside it. */
function isInside(abs: string, dir: string): boolean {
  return abs === dir || abs.startsWith(dir + sep)
}

// The security boundary: a path from a page or a request may only reach the listed folders,
// never arbitrary repo files. Rejects `..` traversal and absolute paths alike.
export function resolveInRoots(repoRoot: string, roots: readonly string[], relPath: string): string {
  const abs = resolve(repoRoot, relPath)
  if (!roots.some((root) => isInside(abs, resolve(repoRoot, root)))) {
    throw new Error(`Path outside ${roots.join(', ') || 'the allowed folders'} is not allowed: ${relPath}`)
  }
  return abs
}

/** The path of `relPath` inside the listed folder it sits in, or undefined. */
export function pathInsideRoot(repoRoot: string, roots: readonly string[], relPath: string): string | undefined {
  const abs = resolve(repoRoot, relPath)
  for (const root of roots) {
    const absRoot = resolve(repoRoot, root)
    if (abs.startsWith(absRoot + sep)) return abs.slice(absRoot.length + 1).split(sep).join('/')
  }
  return undefined
}

// An explicit allowlist, never a directory: the key is what a page writes, so no path from a
// content file reaches the filesystem.
export function resolveImportableDoc(repoRoot: string, docs: Readonly<Record<string, string>>, name: string): string {
  const relative = docs[name]
  if (!relative) {
    const known = Object.keys(docs).join(', ')
    throw new Error(`Unknown document "${name}". Importable documents: ${known || '(none)'}`)
  }
  return resolve(repoRoot, relative)
}

// Read-only-mounted directory holding generated benchmark/test result JSON the
// docs are built from (scripts/website/site.mjs sets MION_DOCDATA=/app/.docdata).
// Empty string when unset so callers can detect "no results available".
export const DOCDATA_DIR = process.env.MION_DOCDATA ? resolve(process.env.MION_DOCDATA) : ''
