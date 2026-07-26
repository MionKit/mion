// Plain syntax-highlighting endpoint for the benchmark hover panels.
// Takes a code string + language and returns server-rendered Shiki HTML — just
// colored `<pre><code>`, no twoslash type hovers. Returns `{html: ''}` on bad
// input or failure so the client can fall back to plain text.

import {highlightCode} from '../utils/highlighter'

export default defineEventHandler(async (event) => {
  const body = await readBody<{code?: string; lang?: 'ts' | 'js'}>(event)
  const code = typeof body?.code === 'string' ? body.code : ''
  const lang = body?.lang === 'js' ? 'js' : 'ts'
  if (!code) return {html: ''}
  try {
    return {html: await highlightCode(code, lang)}
  } catch {
    return {html: ''}
  }
})
