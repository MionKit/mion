import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import { existsSync } from 'fs'

/**
 * API endpoint to read a file from the repository.
 * Used by the TwoslashCode component to load code from file paths.
 * Only allows reading from packages/examples for security.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { path } = body

  if (!path || typeof path !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Missing or invalid path parameter',
    })
  }

  // Security: Only allow reading from packages/examples
  if (!path.startsWith('packages/examples/')) {
    throw createError({
      statusCode: 403,
      message: 'Only files from packages/examples are allowed',
    })
  }

  // Resolve the path relative to the repository root
  const repoRoot = resolve(process.cwd(), '..')
  const filePath = join(repoRoot, path)

  // Prevent path traversal attacks
  if (!filePath.startsWith(repoRoot)) {
    throw createError({
      statusCode: 403,
      message: 'Invalid path',
    })
  }

  if (!existsSync(filePath)) {
    throw createError({
      statusCode: 404,
      message: `File not found: ${path}`,
    })
  }

  try {
    const code = await readFile(filePath, 'utf-8')
    return { code }
  } catch (err) {
    throw createError({
      statusCode: 500,
      message: `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`,
    })
  }
})

