import { createHighlighter } from 'shiki'
import { transformerTwoslash, rendererRich } from '@shikijs/twoslash'

// Cache the highlighter instance
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: ['typescript', 'javascript', 'ts', 'js'],
    })
  }
  return highlighterPromise
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { code, lang = 'ts' } = body

  if (!code) {
    throw createError({
      statusCode: 400,
      message: 'Code is required',
    })
  }

  try {
    const highlighter = await getHighlighter()

    const html = highlighter.codeToHtml(code, {
      lang,
      themes: {
        dark: 'github-dark',
        light: 'github-light',
      },
      transformers: [
        transformerTwoslash({
          explicitTrigger: false,
          renderer: rendererRich(),
        }),
      ],
    })

    return { html }
  } catch (error) {
    console.error('Twoslash rendering error:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

