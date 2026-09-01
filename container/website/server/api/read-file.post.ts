import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { existsSync } from 'fs'
import { getRepoRoot, resolveInPackages } from '../utils/repo-root'

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

  // Resolve under the configured repo root, confined to packages/ (rejects `..`
  // traversal / absolute paths). repoRoot is MION_REPO_ROOT in the container.
  const repoRoot = getRepoRoot(resolve(process.cwd(), '..'))
  let filePath: string
  try {
    filePath = resolveInPackages(repoRoot, path)
  } catch {
    throw createError({ statusCode: 403, message: 'Invalid path' })
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

