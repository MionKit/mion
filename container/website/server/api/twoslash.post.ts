import { createHighlighter } from 'shiki'
import { transformerTwoslash, rendererRich, defaultHoverInfoProcessor } from '@shikijs/twoslash'
// `twoslash` is a transitive dep here; we reach it through `twoslash-vue` (a direct dep)
// which re-exports its own `createTwoslasher`. Functionally identical for non-Vue code.
import { createTwoslasher } from 'twoslash-vue'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative, resolve, dirname, sep } from 'path'
import { createRequire } from 'module'
import { getRepoRoot, resolveInPackages } from '../utils/repo-root'

const nodeRequire = createRequire(import.meta.url)

/**
 * Patterns to match native type signatures that should be filtered out from hover popups.
 * Returns empty string to hide the popup for these native types.
 */
const NATIVE_PATTERNS = [
  /^var console:/,
  /^var JSON:/,
  /^var Math:/,
  /^interface Console\b/,
  /^interface JSON\b/,
  /^interface Math\b/,
  /^interface Array\b/,
  /^interface Object\b/,
  /^interface String\b/,
  /^interface Number\b/,
  /^interface Boolean\b/,
  /^interface Date\b/,
  /^interface RegExp\b/,
  /^interface Error\b/,
  /^interface Promise\b/,
  /^interface Map\b/,
  /^interface Set\b/,
  /^namespace console\b/,
  /^namespace JSON\b/,
  /^namespace Math\b/,
  /^module "console"/,
  /^module "fs"/,
  /^module "path"/,
  /^module "http"/,
  /^module "https"/,
  /^module "url"/,
  /^module "util"/,
  /^module "events"/,
  /^module "stream"/,
  /^module "buffer"/,
  /^module "crypto"/,
  /^module "os"/,
  /^module "child_process"/,
  /^module "cluster"/,
  /^module "dgram"/,
  /^module "dns"/,
  /^module "net"/,
  /^module "readline"/,
  /^module "repl"/,
  /^module "tls"/,
  /^module "tty"/,
  /^module "v8"/,
  /^module "vm"/,
  /^module "zlib"/,
]

/**
 * Custom hover info processor that filters out native types
 */
function filterNativeHoverInfo(info: string): string {
  // First apply the default processing
  const processed = defaultHoverInfoProcessor(info)

  // Check if this matches any native patterns
  for (const pattern of NATIVE_PATTERNS) {
    if (pattern.test(info) || pattern.test(processed)) {
      return '' // Return empty to hide the popup
    }
  }

  // Check for console.* method signatures
  if (info.includes('Console.') || info.includes('console.')) {
    return ''
  }

  return processed
}

const isDev = process.env.NODE_ENV !== 'production'

// Cache the highlighter instance
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null

// Cache for fsMap (loaded once at startup)
let fsMapCache: Map<string, string> | null = null

// Cache for the twoslasher instance: fsMap is read only at create-time,
// so the VFS of package d.ts files must be baked in here, not passed per-call.
let twoslasherInstance: ReturnType<typeof createTwoslasher> | null = null

// Cache for rendered twoslash results (avoids re-rendering on hot reload)
const resultCache = new Map<string, { html: string }>()

function getCacheKey(code: string, path: string | undefined, hoverMode: string | undefined): string {
  return `${path || ''}:${hoverMode || 'default'}:${code}`
}

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: ['typescript', 'javascript', 'ts', 'js'],
    })
  }
  return highlighterPromise
}

/**
 * Recursively find files matching a pattern in a directory
 */
function findFiles(dir: string, pattern: RegExp, files: string[] = []): string[] {
  if (!existsSync(dir)) return files
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      findFiles(fullPath, pattern, files)
    } else if (pattern.test(entry)) {
      files.push(fullPath)
    }
  }
  return files
}

/**
 * The built `.d.ts` a package's own package.json names as its `.` types entry, absolute.
 * Reads the three spellings the workspace uses: a plain `exports['.'].types`, the
 * conditional `exports['.'].import.types` (@mionjs/run-types), and a top-level `types`.
 * Undefined when the manifest names none. Mirrored by repo-contracts.test.ts.
 */
function typesEntry(pkgDir: string): string | undefined {
  const manifestPath = join(pkgDir, 'package.json')
  if (!existsSync(manifestPath)) return undefined
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const root = manifest.exports?.['.']
  const declared: unknown = typeof root === 'string' ? root : (root?.types ?? root?.import?.types ?? manifest.types)
  if (typeof declared !== 'string' || !declared.endsWith('.d.ts')) return undefined
  return resolve(pkgDir, declared)
}

/**
 * Load all .d.ts files from the RunTypes packages into a virtual file system Map
 */
function loadPackageTypes(): Map<string, string> {
  if (fsMapCache) return fsMapCache

  const fsMap = new Map<string, string>()

  // TypeScript lib files (lib.es5.d.ts, lib.dom.d.ts, etc.): required for built-in
  // globals like Date, Set, console. The VFS-backed env has no real filesystem
  // access, so we have to load them ourselves at `/lib.<name>.d.ts`.
  // (Avoid ts.getDefaultLibFilePath: under Nitro's ESM bundle it touches __filename
  // and crashes; resolve typescript via createRequire instead.)
  const tsLibDir = dirname(nodeRequire.resolve('typescript'))
  for (const f of readdirSync(tsLibDir)) {
    if (/^lib\..*\.d\.ts$/.test(f) || f === 'lib.d.ts') {
      fsMap.set('/' + f, readFileSync(join(tsLibDir, f), 'utf-8'))
    }
  }

  // Repo root that contains packages/. Configurable via MION_REPO_ROOT (set by
  // scripts/website/site.mjs to the read-only repo context); falls back to the parent
  // of the website dir. The env also sidesteps the old generate-mode fragility
  // (process.cwd() worked but import.meta.url did not once bundled into chunks).
  const repoRoot = getRepoRoot(resolve(process.cwd(), '..'))
  const packagesDir = join(repoRoot, 'packages')

  // Packages to load. `dir` is the directory under packages/, `name` is the npm
  // package name: the specifier examples actually import, which is what the
  // virtual node_modules path must use. The two differ on every row (the
  // directories kept their pre-scope names when the packages moved onto the
  // @mionjs scope), and getting `name` wrong is silent: the VFS mounts a
  // module nothing imports, every example fails to resolve, and twoslash throws.
  // The mount ROOT is not written here: it is the directory holding the package's
  // own `.` types entry (typesEntry above), read from its package.json. The dists
  // are not laid out alike (core emits `.dist/esm/index.d.ts`, the drizzle packages
  // `.dist/esm/src/index.d.ts`, run-types `dist/`, uws a committed `lib/`), and a
  // hand-written root that misses the real entry mounts a tree whose bare import
  // resolves nothing, and the card renders a compiler error instead of hovers.
  // Subpath imports (@mionjs/run-types/formats, @mionjs/drizzle-orm-pg-core/drizzle)
  // resolve via the sibling `<sub>.d.ts` / `<sub>/index.d.ts` under classic node
  // resolution, which is why every dist keeps its subpaths parallel to its exports.
  // `name` MUST be the PUBLISHED npm name, not the packages/ directory name — the
  // mount path is what an example's bare import resolves against. Both sites share
  // this list; a runtypes page simply never imports an @mionjs package, and vice versa.
  // Pinned by `repo-contracts.test.ts`.
  const packageConfigs = [
    { dir: 'run-types', name: '@mionjs/run-types' },
    { dir: 'devtools', name: '@mionjs/devtools' },
    { dir: 'core', name: '@mionjs/core' },
    { dir: 'router', name: '@mionjs/router' },
    { dir: 'client', name: '@mionjs/client' },
    { dir: 'drizzle-orm', name: '@mionjs/drizzle-orm' },
    { dir: 'drizzle-orm-mysql-core', name: '@mionjs/drizzle-orm-mysql-core' },
    { dir: 'drizzle-orm-pg-core', name: '@mionjs/drizzle-orm-pg-core' },
    { dir: 'drizzle-orm-sqlite-core', name: '@mionjs/drizzle-orm-sqlite-core' },
    { dir: 'platform-aws', name: '@mionjs/platform-aws' },
    { dir: 'platform-bun', name: '@mionjs/platform-bun' },
    { dir: 'platform-cloudflare', name: '@mionjs/platform-cloudflare' },
    { dir: 'platform-gcloud', name: '@mionjs/platform-gcloud' },
    { dir: 'platform-node', name: '@mionjs/platform-node' },
    { dir: 'platform-uws', name: '@mionjs/platform-uws' },
    // the loader shim platform-uws depends on: its types (AppOptions etc.) are a
    // committed hand-written lib/index.d.ts, not a built dist.
    { dir: 'uws', name: '@mionjs/uws' },
    { dir: 'platform-vercel', name: '@mionjs/platform-vercel' },
  ]

  for (const pkg of packageConfigs) {
    const pkgDir = join(packagesDir, pkg.dir)
    const entry = typesEntry(pkgDir)
    if (!entry) {
      console.warn(`[twoslash] ${pkg.name}: package.json declares no types entry, not mounted`)
      continue
    }
    const pkgDistDir = dirname(entry)
    // dist/cjs/ is the CommonJS twin of the same declarations, mounting it would
    // double the VFS for no added resolution, so keep only the ESM tree.
    const dtsFiles = findFiles(pkgDistDir, /\.d\.ts$/).filter(
      (file) => !relative(pkgDistDir, file).startsWith('cjs' + sep),
    )
    if (dtsFiles.length === 0) {
      console.warn(`[twoslash] ${pkg.name}: no .d.ts under ${relative(repoRoot, pkgDistDir)} (not built?), not mounted`)
      continue
    }

    // Synthetic package.json so TS's Node resolver finds the entry (and subpath
    // exports like `@mionjs/run-types/formats`) for bare imports in examples.
    const entryFile = relative(pkgDistDir, entry)
    fsMap.set(
      `/node_modules/${pkg.name}/package.json`,
      JSON.stringify({ name: pkg.name, types: entryFile, main: entryFile }),
    )

    for (const dtsFile of dtsFiles) {
      // Get relative path from dist directory
      const relativePath = relative(pkgDistDir, dtsFile)
      // Create virtual node_modules path
      const virtualPath = `/node_modules/${pkg.name}/${relativePath}`

      try {
        let content = readFileSync(dtsFile, 'utf-8')
        // Strip .ts extensions from imports so TypeScript resolves to .d.ts files.
        // Our .d.ts files carry .ts extensions (e.g. `from './types.ts'`, the
        // source spelling tsc preserves) but the VFS only has .d.ts files.
        // Extensionless imports let TS find them.
        content = content.replace(/(from\s+['"])([^'"]+)\.ts(['"])/g, '$1$2$3')
        fsMap.set(virtualPath, content)
      } catch (e) {
        console.warn(`Failed to read ${dtsFile}:`, e)
      }
    }
  }

  // Third-party deps an example imports, mounted from the repo root's node_modules.
  // Kept to the SHORTEST possible list: every entry copies a whole .d.ts tree into
  // the VFS on each render. `drizzle-orm` is here because the mion home page and the
  // drizzle-orm section import `drizzle-orm/pg-core`, and twoslash fails the whole
  // sample on an unresolved import. A missing dir is skipped, not an error — that is
  // what a fresh clone without a full install looks like.
  // Anything NOT listed (e.g. the `vite` import in the manual-install config example)
  // simply will not type-resolve here.
  const externalDeps = ['drizzle-orm']
  for (const dep of externalDeps) {
    const depDir = join(repoRoot, 'node_modules', dep)
    if (!existsSync(depDir)) continue
    for (const dtsFile of findFiles(depDir, /\.d\.ts$/)) {
      try {
        fsMap.set(`/node_modules/${dep}/${relative(depDir, dtsFile)}`, readFileSync(dtsFile, 'utf-8'))
      } catch (e) {
        console.warn(`Failed to read ${dtsFile}:`, e)
      }
    }
    const depManifest = join(depDir, 'package.json')
    if (existsSync(depManifest)) fsMap.set(`/node_modules/${dep}/package.json`, readFileSync(depManifest, 'utf-8'))
  }

  // Also load source files from examples package for relative imports
  const examplesDir = join(packagesDir, 'examples', 'src')
  const exampleFiles = findFiles(examplesDir, /\.ts$/)

  for (const srcFile of exampleFiles) {
    // Get relative path from examples/src directory
    const relativePath = relative(examplesDir, srcFile)
    // Create virtual path that matches how files are imported
    // Files like user.ts can be found via ./user.ts
    const virtualPath = `/${relativePath}`

    try {
      const content = readFileSync(srcFile, 'utf-8')
      fsMap.set(virtualPath, content)
    } catch (e) {
      console.warn(`Failed to read ${srcFile}:`, e)
    }
  }

  fsMapCache = fsMap
  if (isDev) console.log(`Loaded ${fsMap.size} files for twoslash (d.ts + examples)`)
  return fsMap
}

/**
 * Read code from a file path (only packages/examples allowed)
 * Prepends a comment with the file path and removes trailing newlines
 */
function readCodeFromPath(path: string): string {
  // Security: Only allow reading from packages/examples
  if (!path.startsWith('packages/examples/')) {
    throw new Error('Only files from packages/examples are allowed')
  }

  // Resolve under the configured repo root, confined to packages/.
  const repoRoot = getRepoRoot(resolve(process.cwd(), '..'))
  const filePath = resolveInPackages(repoRoot, path)

  // Prevent path traversal attacks
  if (!filePath.startsWith(repoRoot)) {
    throw new Error('Invalid path')
  }

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${path}`)
  }

  // Read file content, remove trailing newlines, add file path comment
  const content = readFileSync(filePath, 'utf-8').trimEnd()
  return `// ${path}\n${content}`
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  // 'explicit' (the default): only the annotations written in the code render; no
  // hover on every identifier, which read as noise on the docs pages.
  const { code: rawCode, lang = 'ts', path = '', hoverMode = 'explicit' } = body

  // Get code from either direct input or file path
  let code: string
  if (rawCode) {
    code = rawCode
  } else if (path) {
    try {
      code = readCodeFromPath(path)
    } catch (err) {
      throw createError({
        statusCode: 400,
        message: err instanceof Error ? err.message : 'Failed to read file',
      })
    }
  } else {
    throw createError({
      statusCode: 400,
      message: 'Either code or path is required',
    })
  }

  // Use path for relative import resolution (filePath for backwards compat)
  const filePath = path

  // Check cache first to avoid re-rendering on hot reload
  const cacheKey = getCacheKey(code, path, hoverMode)
  const cached = resultCache.get(cacheKey)
  if (cached) {
    if (isDev) console.log(`[twoslash] ${path || 'inline'} (cached)`)
    return cached
  }

  try {
    if (isDev) console.log(`[twoslash] ${path || 'inline'} (${code.length} chars)`)
    const highlighter = await getHighlighter()
    const fsMap = loadPackageTypes()
    if (!twoslasherInstance) {
      twoslasherInstance = createTwoslasher({
        fsMap,
        compilerOptions: {
          // Node module resolution so TS resolves .d.ts files (and subpath
          // exports like @mionjs/run-types/formats) for bare imports
          // out of the VFS. Bundler resolution doesn't resolve .d.ts re-exports.
          target: 99, // ESNext
          module: 99, // ESNext
          moduleResolution: 2, // Node (classic node resolution)
          strict: false,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
        },
      })
    }

    // If we have a file path (e.g., packages/examples/src/enrich/friendly-user.ts)
    // Set up the extra files so relative imports work
    // The file path after examples/src becomes the virtual path
    let extraFiles: Record<string, string> | undefined
    if (filePath && filePath.includes('packages/examples/src/')) {
      // Extract path after packages/examples/src/
      const match = filePath.match(/packages\/examples\/src\/(.+)$/)
      if (match) {
        const relativePath = match[1]
        // Get the directory of the current file
        const fileDir = relativePath.substring(0, relativePath.lastIndexOf('/'))

        // Add all other files from the same directory as extra files
        // so that relative imports like ./user.ts work
        extraFiles = {}
        const prefix = `/${fileDir}/`
        for (const [path, content] of fsMap.entries()) {
          if (path.startsWith(prefix) && !path.endsWith(relativePath)) {
            // Convert /enrich/user.ts to ./user.ts style import
            const fileName = path.substring(prefix.length)
            extraFiles[`./${fileName}`] = content
          }
        }
      }
    }

    // One text processor for hovers and queries alike (the renderer runs it on both);
    // explicit mode removes the hover nodes themselves (filterNode below), so the
    // query boxes keep their type text.
    const hoverInfoProcessor = filterNativeHoverInfo

    let html = highlighter.codeToHtml(code, {
      lang,
      themes: {
        dark: 'github-dark',
        light: 'github-light',
      },
      transformers: [
        transformerTwoslash({
          // Use our own twoslasher so the fsMap of package d.ts files is in the VFS.
          // @shikijs/twoslash's default creates an FS-backed twoslasher (real node_modules).
          twoslasher: twoslasherInstance,
          explicitTrigger: false,
          renderer: rendererRich({
            processHoverInfo: hoverInfoProcessor,
          }),
          twoslashOptions: {
            extraFiles,
            // Enable custom annotation tags like @log, @error, @warn, @annotate
            customTags: ['log', 'error', 'warn', 'annotate'],
            // Explicit mode: drop the hover nodes before rendering, so nothing appears on
            // hover. The queries (^?) still need the type text collected, so hovers are
            // filtered out rather than never collected; completions (^|), errors and the
            // custom tags are their own node types and pass through.
            ...(hoverMode === 'explicit' ? { filterNode: (node: { type: string }) => node.type !== 'hover' } : {}),
          },
        }),
      ],
    })

    // Remove newlines between </span> and <span class="line"> to avoid double line spacing
    // Shiki outputs formatted HTML with newlines for readability, but in <pre> they become visible
    // Keep the empty <span class="line"></span> elements for intentional blank lines in source code
    html = html.replace(/(<\/span>)\n(<span class="line">)/g, '$1$2')

    const result = { html }
    resultCache.set(cacheKey, result)
    return result
  } catch (error) {
    console.error('Twoslash rendering error:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

