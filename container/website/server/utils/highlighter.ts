// Server-side Shiki highlighter for the small code snippets shown in the
// benchmark hover panels. Mirrors the setup in server/api/twoslash.post.ts
// (github-dark + github-light dual theme, ts/js grammars) but without the twoslash
// type pass — these panels just need syntax colors. A singleton highlighter + cache
// cache keep repeat requests cheap. Rendering happens on the server, so the
// browser receives already-highlighted HTML and ships no Shiki bundle.

import {createHighlighter} from 'shiki'

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: ['typescript', 'javascript'],
    })
  }
  return highlighterPromise
}

const cache = new Map<string, string>()

// Pretty-print the snippet before highlighting so the hover panels show
// readable, consistently-formatted code — the generated JIT functions arrive as
// dense single-line bodies and competitor sources use varied house styles.
// Prettier (a website devDependency) runs on the server; any parse failure (a
// bare expression fragment, exotic syntax) falls back to the original text so a
// snippet is never lost. Dynamic import keeps prettier off the cold path until a
// hover actually fires.
async function prettify(code: string, lang: 'ts' | 'js'): Promise<string> {
  try {
    const prettier = await import('prettier')
    const formatted = await prettier.format(code, {
      parser: lang === 'js' ? 'babel' : 'typescript',
      printWidth: 80,
      semi: true,
      singleQuote: true,
      tabWidth: 2,
    })
    return formatted.trimEnd()
  } catch {
    return code
  }
}

export async function highlightCode(code: string, lang: 'ts' | 'js'): Promise<string> {
  const langId = lang === 'js' ? 'javascript' : 'typescript'
  const key = `${langId}:${code}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const pretty = await prettify(code, lang)
  const highlighter = await getHighlighter()
  // Dual theme so one render serves both color modes: the dark theme is inlined
  // (the site defaults to dark) and the light theme rides CSS variables that a
  // `:root.light` rule swaps in — no per-request theme, no re-highlight on toggle.
  const html = highlighter.codeToHtml(pretty, {
    lang: langId,
    themes: {dark: 'github-dark', light: 'github-light'},
    defaultColor: 'dark',
  })
  cache.set(key, html)
  return html
}
