import { createHighlighter } from 'shiki'
import { transformerTwoslash, rendererRich, defaultHoverInfoProcessor } from '@shikijs/twoslash'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative, resolve } from 'path'

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

  // Get the repo root (parent of website directory)
  // process.cwd() is always the website dir in both dev and generate modes.
  // import.meta.url breaks during generate because the code is bundled into .nuxt/prerender/chunks/
  const repoRoot = resolve(process.cwd(), '..')
  const packagesDir = join(repoRoot, 'packages')

  // Packages to load with their dist paths
  const packageConfigs = [
    { name: 'core', distPath: '.dist/esm' },
    { name: 'router', distPath: '.dist/esm' },
    { name: 'http', distPath: '.dist/esm' },
    { name: 'client', distPath: '.dist/esm' },
    { name: 'run-types', distPath: '.dist/esm' },
    { name: 'aws', distPath: '.dist/esm' },
    { name: 'bun', distPath: '.dist/esm' },
    { name: 'aot-caches', distPath: 'build/esm' },
  ]

  for (const pkg of packageConfigs) {
    const pkgDistDir = join(packagesDir, pkg.name, pkg.distPath)
    const dtsFiles = findFiles(pkgDistDir, /\.d\.ts$/)

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
          explicitTrigger: false,
          renderer: rendererRich({
            processHoverInfo: hoverInfoProcessor,
          }),
          twoslashOptions: {
            fsMap,
            extraFiles,
            // Enable custom annotation tags like @log, @error, @warn, @annotate
            customTags: ['log', 'error', 'warn', 'annotate'],
            compilerOptions: {
              // Use Node module resolution so TypeScript properly resolves .d.ts
              // files in the VFS and evaluates complex mapped types from packages.
              // Bundler resolution doesn't resolve .d.ts re-exports in the VFS.
              target: 99, // ESNext
              module: 99, // ESNext
              moduleResolution: 2, // Node (classic node resolution)
              strict: false, // Allow implicit any for examples
              esModuleInterop: true,
              skipLibCheck: true,
              noEmit: true,
            },
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

