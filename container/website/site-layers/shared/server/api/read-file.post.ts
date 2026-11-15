import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { resolveInRoots, type ExampleToolContext } from '../utils/repo-root'

/** Serves the site's example files to the TwoslashCode component. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { path } = body

  if (!path || typeof path !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Missing or invalid path parameter',
    })
  }

  // Only the site's example folders are served; `..` traversal and absolute paths fail the same check.
  const tool = useRuntimeConfig().exampleTool as ExampleToolContext
  let filePath: string
  try {
    filePath = resolveInRoots(tool.repoRoot, tool.exampleDirs, path)
  } catch {
    throw createError({ statusCode: 403, message: 'Only files from the example folders are allowed' })
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

