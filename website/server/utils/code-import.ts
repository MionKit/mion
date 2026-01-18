import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { watch, type FSWatcher } from 'chokidar'
import type { Plugin, ViteDevServer } from 'vite'

// Get monorepo root (parent of website folder)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const MONOREPO_ROOT = resolve(__dirname, '../../..')
const CONTENT_DIR = resolve(__dirname, '../../content')

/**
 * Parse HTML-style attributes from a string
 * Handles both quoted and unquoted values
 */
export function parseAttributes(str: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g
  let match
  while ((match = attrRegex.exec(str)) !== null) {
    const [, name, doubleQuoted, singleQuoted, unquoted] = match
    if (name) {
      attrs[name] = doubleQuoted ?? singleQuoted ?? unquoted ?? ''
    }
  }
  return attrs
}

/**
 * Read and extract code from a file
 */
export function readCodeFile(
  filePath: string,
  lines: string,
  commentStart: string,
  commentEnd: string
): string {
  const absolutePath = resolve(MONOREPO_ROOT, filePath)

  let content: string
  try {
    content = readFileSync(absolutePath, 'utf-8')
  } catch {
    throw new Error(`File not found: ${filePath}`)
  }

  const allLines = content.split('\n')

  if (lines) {
    return extractByLines(allLines, lines)
  }

  if (commentStart) {
    return extractByComments(allLines, commentStart, commentEnd)
  }

  return content.trimEnd()
}

/**
 * Extract lines by line range
 * Format: "1,10" extracts lines 1-10, "5" extracts from line 5 to end
 */
function extractByLines(allLines: string[], linesSpec: string): string {
  const parts = linesSpec.split(',').map(s => s.trim())
  const startPart = parts[0] ?? ''
  const endPart = parts[1]
  const startLine = parseInt(startPart, 10)
  const endLine = endPart ? parseInt(endPart, 10) : allLines.length

  if (isNaN(startLine) || startLine < 1) {
    throw new Error(`Invalid start line: ${startPart}`)
  }

  if (isNaN(endLine) || endLine < startLine) {
    throw new Error(`Invalid end line: ${endPart}`)
  }

  const extracted = allLines.slice(startLine - 1, endLine)
  return extracted.join('\n')
}

/**
 * Extract content between comment markers
 * Excludes the marker lines themselves
 */
function extractByComments(
  allLines: string[],
  commentStart: string,
  commentEnd: string
): string {
  let startIdx = -1
  let endIdx = -1

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i] ?? ''
    if (startIdx === -1 && line.includes(commentStart)) {
      startIdx = i
    } else if (startIdx !== -1 && commentEnd && line.includes(commentEnd)) {
      endIdx = i
      break
    }
  }

  if (startIdx === -1) {
    throw new Error(`Start comment marker not found: ${commentStart}`)
  }

  if (endIdx === -1) {
    endIdx = allLines.length
  }

  const extracted = allLines.slice(startIdx + 1, endIdx)
  return extracted.join('\n')
}

/**
 * Process code-import tags in markdown content
 * Replaces <code-import ... /> tags with actual code blocks
 * @param body - The markdown content to process
 * @param isDev - Whether to include filename comments (dev mode)
 */
export function processCodeImports(body: string, isDev = false): string {
  const codeImportRegex = /<code-import\s+([^>]*?)\s*\/>/g

  return body.replace(codeImportRegex, (_match: string, attributesStr: string) => {
    try {
      const attributes = parseAttributes(attributesStr)

      const lang = attributes.lang || 'ts'
      const filePath = attributes.path || ''
      const lines = attributes.lines || ''
      const commentStart = attributes.commentStart || ''
      const commentEnd = attributes.commentEnd || ''

      if (!filePath) {
        throw new Error('Missing required "path" attribute')
      }

      const code = readCodeFile(filePath, lines, commentStart, commentEnd)

      // In dev mode, add filename as comment at the beginning
      const fileComment = isDev ? `// ${filePath}\n` : ''

      return `\`\`\`${lang}\n${fileComment}${code}\n\`\`\``
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return `\`\`\`text\n// Error processing code-import:\n// ${errorMessage}\n\`\`\``
    }
  })
}

// ============================================================================
// Example File Watcher - Hot reload for code examples in dev mode
// ============================================================================

/**
 * Find markdown files that reference a given example path
 */
function findMarkdownFiles(relativePath: string): string[] {
  try {
    const result = execSync(
      `grep -rl "${relativePath}" "${CONTENT_DIR}" --include="*.md" 2>/dev/null || true`,
      { encoding: 'utf-8' }
    )
    return result.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Update the timestamp in code-import tags to trigger Nuxt Content re-processing
 */
function updateTimestamp(mdFilePath: string, relativePath: string): boolean {
  const newTs = Date.now()
  try {
    const content = readFileSync(mdFilePath, 'utf-8')
    const escapedPath = relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // Match code-import tags with this path and update ts attribute
    const regex = new RegExp(
      `(<code-import[^>]*?)\\bts="\\d+"([^>]*path="${escapedPath}"[^>]*/>)|(<code-import[^>]*path="${escapedPath}"[^>]*?)\\bts="\\d+"([^>]*/>)`,
      'g'
    )

    const updated = content.replace(regex, (_match, g1, g2, g3, g4) => {
      if (g1 && g2) return `${g1}ts="${newTs}"${g2}`
      if (g3 && g4) return `${g3}ts="${newTs}"${g4}`
      return _match
    })

    if (updated !== content) {
      writeFileSync(mdFilePath, updated, 'utf-8')
      return true
    }
  } catch (e) {
    console.error(`   ✗ Failed to update: ${mdFilePath}`, e)
  }
  return false
}

/**
 * Vite plugin that watches example files and updates markdown timestamps
 * to trigger Nuxt Content re-processing when examples change.
 */
export function exampleWatcherPlugin(): Plugin {
  let watcher: FSWatcher | null = null

  return {
    name: 'example-watcher',
    configureServer(server: ViteDevServer) {
      const packageFolders = [
        'router', 'client', 'run-types', 'type-formats', 'codegen',
        'http', 'bun', 'aws', 'gcloud', 'quick-start', 'examples'
      ]
      const watchPaths = packageFolders.map(pkg =>
        resolve(MONOREPO_ROOT, 'packages', pkg, 'examples')
      )

      console.log('\n👀 Watching example folders for changes...')

      watcher = watch(watchPaths, {
        ignoreInitial: true,
        persistent: true
      })

      watcher.on('all', (event, filePath) => {
        if (!filePath.endsWith('.ts')) return

        const relativePath = filePath.replace(MONOREPO_ROOT + '/', '')
        console.log(`\n📝 Example ${event}:`)
        console.log(`   src: ${relativePath}`)

        // Find and update markdown files
        const mdFiles = findMarkdownFiles(relativePath)
        if (mdFiles.length > 0) {
          let updated = 0
          mdFiles.forEach(mdFile => {
            const relMdFile = mdFile.replace(MONOREPO_ROOT + '/', '')
            if (updateTimestamp(mdFile, relativePath)) {
              console.log(`   doc: ${relMdFile} ✓`)
              updated++
            }
          })
          if (updated === 0) {
            console.log('   ⚠ No timestamps updated (ensure ts="0" exists in code-import tags)')
          }
        } else {
          console.log('   ⚠ No markdown files reference this example')
        }
      })

      server.httpServer?.on('close', () => {
        watcher?.close()
      })
    }
  }
}
