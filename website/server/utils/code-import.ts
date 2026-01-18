import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Get monorepo root (parent of website folder)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const MONOREPO_ROOT = resolve(__dirname, '../../..')

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
 */
export function processCodeImports(body: string): string {
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

      return `\`\`\`${lang}\n${code}\n\`\`\``
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return `\`\`\`text\n// Error processing code-import:\n// ${errorMessage}\n\`\`\``
    }
  })
}

