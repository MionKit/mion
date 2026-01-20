import { createHighlighter } from 'shiki'
import { transformerTwoslash, rendererRich } from '@shikijs/twoslash'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname, relative } from 'path'

// Cache the highlighter instance
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null

// Cache for fsMap (loaded once)
let fsMapCache: Map<string, string> | null = null

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
  const websiteDir = dirname(new URL(import.meta.url).pathname)
  const repoRoot = join(websiteDir, '..', '..', '..')
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
      const virtualPath = `/node_modules/@mionkit/${pkg.name}/${relativePath}`

      try {
        const content = readFileSync(dtsFile, 'utf-8')
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
  console.log(`Loaded ${fsMap.size} files for twoslash (d.ts + examples)`)
  return fsMap
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { code, lang = 'ts', filePath = '' } = body

  if (!code) {
    throw createError({
      statusCode: 400,
      message: 'Code is required',
    })
  }

  try {
    const highlighter = await getHighlighter()
    const fsMap = loadMionPackageTypes()

    // Log the first few files for debugging
    console.log(`fsMap loaded: ${fsMap.size} files`)
    if (fsMap.size > 0) {
      console.log('Sample paths:', Array.from(fsMap.keys()).slice(0, 3))
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
        console.log(`Extra files for ${relativePath}:`, Object.keys(extraFiles))
      }
    }

    let html = highlighter.codeToHtml(code, {
      lang,
      themes: {
        dark: 'github-dark',
        light: 'github-light',
      },
      transformers: [
        transformerTwoslash({
          explicitTrigger: false,
          renderer: rendererRich(),
          twoslashOptions: {
            fsMap,
            extraFiles,
            compilerOptions: {
              // Use ESNext with bundler resolution for best compatibility
              // ModuleResolutionKind: Bundler=100, NodeNext=99
              // ModuleKind: ESNext=99, Preserve=200
              target: 99, // ESNext
              module: 99, // ESNext
              moduleResolution: 100, // Bundler (not 99 which is NodeNext!)
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

    return { html }
  } catch (error) {
    console.error('Twoslash rendering error:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

