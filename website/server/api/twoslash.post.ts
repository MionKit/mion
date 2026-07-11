import { createHighlighter } from 'shiki'
import { transformerTwoslash, rendererRich, defaultHoverInfoProcessor } from '@shikijs/twoslash'
// `twoslash` is a transitive dep here; we reach it through `twoslash-vue` (a direct dep)
// which re-exports its own `createTwoslasher`. Functionally identical for non-Vue code.
import { createTwoslasher } from 'twoslash-vue'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative, resolve, dirname } from 'path'
import { createRequire } from 'module'

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

/**
 * Hover info processor for explicit mode - hides all automatic hovers.
 * Explicit twoslash annotations (// ^?, // ^|, errors) are handled separately
 * by twoslash and don't go through processHoverInfo.
 */
function explicitModeHoverInfo(_info: string): string {
  // Return empty string to hide all automatic hover popups
  return ''
}

const isDev = process.env.NODE_ENV !== 'production'

// Cache the highlighter instance
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null

// Cache for fsMap (loaded once at startup)
let fsMapCache: Map<string, string> | null = null

// Cache for the twoslasher instance — fsMap is read only at create-time,
// so the VFS of mion d.ts files must be baked in here, not passed per-call.
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
 * Load all .d.ts files from mion packages into a virtual file system Map
 */
function loadMionPackageTypes(): Map<string, string> {
  if (fsMapCache) return fsMapCache

  const fsMap = new Map<string, string>()

  // TypeScript lib files (lib.es5.d.ts, lib.dom.d.ts, etc.) — required for built-in
  // globals like Date, Set, console. The VFS-backed env has no real filesystem
  // access, so we have to load them ourselves at `/lib.<name>.d.ts`.
  // (Avoid ts.getDefaultLibFilePath — under Nitro's ESM bundle it touches __filename
  // and crashes; resolve typescript via createRequire instead.)
  const tsLibDir = dirname(nodeRequire.resolve('typescript'))
  for (const f of readdirSync(tsLibDir)) {
    if (/^lib\..*\.d\.ts$/.test(f) || f === 'lib.d.ts') {
      fsMap.set('/' + f, readFileSync(join(tsLibDir, f), 'utf-8'))
    }
  }

  // Get the repo root (parent of website directory)
  // process.cwd() is always the website dir in both dev and generate modes.
  // import.meta.url breaks during generate because the code is bundled into .nuxt/prerender/chunks/
  const repoRoot = resolve(process.cwd(), '..')
  const packagesDir = join(repoRoot, 'packages')

  // Packages to load. `dir` is the directory under packages/, `name` is the
  // @mionjs/<name> npm package name (used to build the virtual node_modules path).
  // They differ for `drizze` (dir) → `drizzle` (npm).
  const packageConfigs = [
    { dir: 'core', name: 'core', distPath: '.dist/esm' },
    { dir: 'router', name: 'router', distPath: '.dist/esm' },
    { dir: 'client', name: 'client', distPath: '.dist/esm' },
    { dir: 'run-types', name: 'run-types', distPath: '.dist/esm' },
    { dir: 'type-formats', name: 'type-formats', distPath: '.dist/esm' },
    { dir: 'drizze', name: 'drizzle', distPath: '.dist/esm' },
    { dir: 'platform-aws', name: 'platform-aws', distPath: '.dist/esm' },
    { dir: 'platform-bun', name: 'platform-bun', distPath: '.dist/esm' },
    { dir: 'platform-cloudflare', name: 'platform-cloudflare', distPath: '.dist/esm' },
    { dir: 'platform-gcloud', name: 'platform-gcloud', distPath: '.dist/esm' },
    { dir: 'platform-node', name: 'platform-node', distPath: '.dist/esm' },
    { dir: 'platform-vercel', name: 'platform-vercel', distPath: '.dist/esm' },
  ]

  for (const pkg of packageConfigs) {
    const pkgDistDir = join(packagesDir, pkg.dir, pkg.distPath)
    const dtsFiles = findFiles(pkgDistDir, /\.d\.ts$/)
    if (dtsFiles.length === 0) continue

    // Synthetic package.json so TS's Node resolver finds `index.d.ts` (and subpath
    // exports like `@mionjs/type-formats/StringFormats`) for bare imports in examples.
    fsMap.set(
      `/node_modules/@mionjs/${pkg.name}/package.json`,
      JSON.stringify({ name: `@mionjs/${pkg.name}`, types: 'index.d.ts', main: 'index.d.ts' }),
    )

    for (const dtsFile of dtsFiles) {
      // Get relative path from dist directory
      const relativePath = relative(pkgDistDir, dtsFile)
      // Create virtual node_modules path
      const virtualPath = `/node_modules/@mionjs/${pkg.name}/${relativePath}`

      try {
        let content = readFileSync(dtsFile, 'utf-8')
        // Strip .ts extensions from imports so TypeScript resolves to .d.ts files.
        // Mion's .d.ts files use .ts extensions (e.g. `from './types.ts'`)
        // but the VFS only has .d.ts files. Extensionless imports let TS find them.
        content = content.replace(/(from\s+['"])([^'"]+)\.ts(['"])/g, '$1$2$3')
        fsMap.set(virtualPath, content)
      } catch (e) {
        console.warn(`Failed to read ${dtsFile}:`, e)
      }
    }
  }

  // External deps referenced from examples — load their .d.ts files into the VFS too.
  // Sourced from the monorepo root's node_modules (where the @mionjs/examples package
  // installed them). Without these, twoslash fails on imports like `drizzle-orm/pg-core`.
  const externalDeps = ['drizzle-orm']
  for (const dep of externalDeps) {
    const depDir = join(repoRoot, 'node_modules', dep)
    const depDts = findFiles(depDir, /\.d\.ts$/)
    for (const dtsFile of depDts) {
      const relativePath = relative(depDir, dtsFile)
      const virtualPath = `/node_modules/${dep}/${relativePath}`
      try {
        fsMap.set(virtualPath, readFileSync(dtsFile, 'utf-8'))
      } catch (e) {
        console.warn(`Failed to read ${dtsFile}:`, e)
      }
    }
    // Real package.json (drizzle-orm uses subpath exports which Node10 resolution
    // doesn't honor, but the per-directory index.d.ts fallback works for our usage).
    try {
      const pkgJsonPath = join(depDir, 'package.json')
      if (existsSync(pkgJsonPath)) {
        fsMap.set(`/node_modules/${dep}/package.json`, readFileSync(pkgJsonPath, 'utf-8'))
      }
    } catch {}
  }

  // Also load source files from examples package for relative imports
  const examplesDir = join(packagesDir, 'examples', 'src')
  const exampleFiles = findFiles(examplesDir, /\.ts$/)

  for (const srcFile of exampleFiles) {
    // Get relative path from examples/src directory
    const relativePath = relative(examplesDir, srcFile)
    // Create virtual path that matches how files are imported
    // Files like about-server.ts can be found via ./about-server.ts
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

  // Resolve the path relative to the repository root
  const repoRoot = resolve(process.cwd(), '..')
  const filePath = join(repoRoot, path)

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
  const { code: rawCode, lang = 'ts', path = '', hoverMode = 'all' } = body

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
    const fsMap = loadMionPackageTypes()
    if (!twoslasherInstance) {
      twoslasherInstance = createTwoslasher({
        fsMap,
        compilerOptions: {
          // Node module resolution so TS resolves .d.ts files (and subpath
          // exports like @mionjs/type-formats/StringFormats) for bare imports
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

    // If we have a file path (e.g., packages/examples/src/introduction/about-client.ts)
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
        // so that relative imports like ./about-server.ts work
        extraFiles = {}
        const prefix = `/${fileDir}/`
        for (const [path, content] of fsMap.entries()) {
          if (path.startsWith(prefix) && !path.endsWith(relativePath)) {
            // Convert /introduction/about-server.ts to ./about-server.ts style import
            const fileName = path.substring(prefix.length)
            extraFiles[`./${fileName}`] = content
          }
        }
      }
    }

    // Choose hover info processor based on hoverMode
    const hoverInfoProcessor = hoverMode === 'explicit'
      ? explicitModeHoverInfo
      : filterNativeHoverInfo

    let html = highlighter.codeToHtml(code, {
      lang,
      themes: {
        dark: 'github-dark',
        light: 'github-light',
      },
      transformers: [
        transformerTwoslash({
          // Use our own twoslasher so the fsMap of mion d.ts files is in the VFS.
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

