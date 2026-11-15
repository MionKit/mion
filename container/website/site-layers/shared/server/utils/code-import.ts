import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import type { Plugin, ViteDevServer } from 'vite'
import { resolveInRoots, resolveImportableDoc, type ExampleToolContext } from './repo-root'

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
  tool: ExampleToolContext,
  filePath: string,
  lines: string,
  commentStart: string,
  commentEnd: string
): string {
  // Throws when filePath escapes the site's read roots.
  const absolutePath = resolveInRoots(tool.repoRoot, tool.readRoots, filePath)

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

// The leading H1 is dropped: Docus takes the page title from frontmatter, so keeping it would render the heading twice.
/** Inlines an allowlisted repo document (the site's `importableDocs`) as MARKDOWN: a repo spec has exactly one copy. */
export function processMarkdownImports(tool: ExampleToolContext, body: string, isDev = false): string {
  const markdownImportRegex = /<markdown-import\s+([^>]*?)\s*\/>/g

  return body.replace(markdownImportRegex, (_match: string, attributesStr: string) => {
    try {
      const attributes = parseAttributes(attributesStr)
      const doc = attributes.doc || ''
      if (!doc) throw new Error('Missing required "doc" attribute')

      const absolutePath = resolveImportableDoc(tool.repoRoot, tool.importableDocs, doc)
      let content: string
      try {
        content = readFileSync(absolutePath, 'utf-8')
      } catch {
        throw new Error(`Document not readable: ${doc}`)
      }

      const withoutTitle = content.replace(/^#\s+[^\n]*\n+/, '')
      const sourceNote = isDev ? `<!-- markdown-import: ${doc} -->\n\n` : ''
      return `${sourceNote}${withoutTitle.trim()}`
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return `::alert{type="warning"}\nError processing markdown-import: ${errorMessage}\n::`
    }
  })
}

/** Replaces `<code-import ... />` tags with code blocks; `isDev` adds the file name as a first comment. */
export function processCodeImports(tool: ExampleToolContext, body: string, isDev = false): string {
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

      const code = readCodeFile(tool, filePath, lines, commentStart, commentEnd)

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
function findMarkdownFiles(contentDir: string, relativePath: string): string[] {
  try {
    const result = execSync(
      `grep -rl "${relativePath}" "${contentDir}" --include="*.md" 2>/dev/null || true`,
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
// Lock set to track files currently being written (prevents race conditions)
const filesBeingProcessed = new Set<string>()

/**
 * Vite plugin that watches example files and invalidates the Vite cache
 * for markdown files that reference them, triggering Nuxt Content re-processing.
 */
// `contentDir` is the consuming site's content folder: the watcher stamps its pages, never a layer's.
export function exampleWatcherPlugin(tool: ExampleToolContext, contentDir: string, usePolling = process.env.CHOKIDAR_USEPOLLING === 'true'): Plugin {
  const repoRoot = tool.repoRoot
  return {
    name: 'code-examples-watcher',
    configureServer(server: ViteDevServer) {
      // Prevent duplicate watchers (configureServer is called for both client and server)
      if (watcherInstance) return

      const watchPaths = tool.exampleDirs.map((dir) => resolve(repoRoot, dir))
      if (watchPaths.length === 0) return

      console.log('\n👀 Watching example folders for changes...')

      watcherInstance = watch(watchPaths, {
        ignoreInitial: true,
        persistent: true,
        // Poll on bind-mounted hosts (no native fs events); interval keeps CPU low
        usePolling,
        interval: 300,
        // Ignore permission and access time changes
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50
        }
      })

      // Handler for file changes
      const handleFileChange = (event: string, filePath: string) => {
        if (!filePath.endsWith('.ts')) return

        // Debounce: ignore duplicate events for the same file within 1 second
        // This prevents rapid successive changes (e.g., on every keystroke) from causing issues
        const existingTimeout = debounceMap.get(filePath)
        if (existingTimeout) {
          clearTimeout(existingTimeout)
        }

        debounceMap.set(
          filePath,
          setTimeout(() => {
            debounceMap.delete(filePath)

            const relativePath = filePath.replace(repoRoot + '/', '')
            console.log(`\n📝 Example ${event}:`)
            console.log(`   src: ${relativePath}`)

            // Find markdown files that reference this example
            const mdFiles = findMarkdownFiles(contentDir, relativePath)
            if (mdFiles.length > 0) {
              mdFiles.forEach(mdFile => {
                // Check if this markdown file is currently being processed (file lock)
                // This prevents race conditions when multiple events trigger for the same file
                if (filesBeingProcessed.has(mdFile)) {
                  console.log(`   ⏳ ${mdFile.replace(repoRoot + '/', '')} is being processed, skipping...`)
                  return
                }

                // Acquire lock for this markdown file
                filesBeingProcessed.add(mdFile)

                try {
                  const relMdFile = mdFile.replace(repoRoot + '/', '')

                  // Update timestamp comment at the end of the file to trigger Nuxt Content reload
                  const content = readFileSync(mdFile, 'utf-8')

                  // Safety check: don't write if content is empty or suspiciously short
                  if (!content || content.trim().length < 10) {
                    console.log(`   ⚠ ${relMdFile} appears empty or corrupted, skipping update`)
                    return
                  }

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

                  // Atomic write: ensure we write the complete content
                  writeFileSync(mdFile, newContent, { encoding: 'utf-8', flag: 'w' })
                  console.log(`   doc: ${relMdFile} ✓`)
                } catch (err) {
                  console.error(`   ❌ Error updating ${mdFile}:`, err)
                } finally {
                  // Release lock for this markdown file
                  filesBeingProcessed.delete(mdFile)
                }
              })
            } else {
              console.log('   ⚠ No markdown files reference this example')
            }
          }, 1000)
        )
      }

      // Only listen for specific events, not 'all' which may include access events on some systems
      watcherInstance.on('add', (path) => handleFileChange('add', path))
      watcherInstance.on('change', (path) => handleFileChange('change', path))
      watcherInstance.on('unlink', (path) => handleFileChange('unlink', path))

      server.httpServer?.on('close', () => {
        watcherInstance?.close()
        watcherInstance = null
      })
    }
  }
}
