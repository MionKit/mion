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

// Module-level state to prevent multiple watchers
let watcherInstance: FSWatcher | null = null
// Debounce map to prevent duplicate events for the same file
const debounceMap = new Map<string, NodeJS.Timeout>()

/**
 * Vite plugin that watches example files and invalidates the Vite cache
 * for markdown files that reference them, triggering Nuxt Content re-processing.
 */
export function exampleWatcherPlugin(): Plugin {
  return {
    name: 'code-examples-watcher',
    configureServer(server: ViteDevServer) {
      // Prevent duplicate watchers (configureServer is called for both client and server)
      if (watcherInstance) return

      // All examples are centralized in packages/examples/src
      const watchPath = resolve(MONOREPO_ROOT, 'packages', 'examples', 'src')

      console.log('\n👀 Watching example folders for changes...')

      watcherInstance = watch(watchPath, {
        ignoreInitial: true,
        persistent: true
      })

      watcherInstance.on('all', (event, filePath) => {
        if (!filePath.endsWith('.ts')) return

        // Debounce: ignore duplicate events for the same file within 300ms
        const existingTimeout = debounceMap.get(filePath)
        if (existingTimeout) {
          clearTimeout(existingTimeout)
        }

        debounceMap.set(
          filePath,
          setTimeout(() => {
            debounceMap.delete(filePath)

            const relativePath = filePath.replace(MONOREPO_ROOT + '/', '')
            console.log(`\n📝 Example ${event}:`)
            console.log(`   src: ${relativePath}`)

            // Find markdown files that reference this example
            const mdFiles = findMarkdownFiles(relativePath)
            if (mdFiles.length > 0) {
              mdFiles.forEach(mdFile => {
                const relMdFile = mdFile.replace(MONOREPO_ROOT + '/', '')

                // Update timestamp comment at the end of the file to trigger Nuxt Content reload
                const content = readFileSync(mdFile, 'utf-8')
                const timestampComment = `<!-- code-import-timestamp ${Date.now()} -->`
                const timestampRegex = /\n?<!-- code-import-timestamp \d+ -->\n?$/

                let newContent: string
                if (timestampRegex.test(content)) {
                  // Replace existing timestamp (preserve newlines before and after)
                  newContent = content.replace(timestampRegex, '\n' + timestampComment + '\n')
                } else {
                  // Add timestamp at the end with newline before and after
                  newContent = content.trimEnd() + '\n\n' + timestampComment + '\n'
                }

                writeFileSync(mdFile, newContent)
                console.log(`   doc: ${relMdFile} ✓`)
              })
            } else {
              console.log('   ⚠ No markdown files reference this example')
            }
          }, 300)
        )
      })

      server.httpServer?.on('close', () => {
        watcherInstance?.close()
        watcherInstance = null
      })
    }
  }
}
