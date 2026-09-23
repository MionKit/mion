import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Expands `::function-catalog` into a markdown table before the page is parsed, so the calls are
// highlighted at build time like any other inline code; a component could only highlight at runtime,
// which a static site cannot serve.
const CATALOG = resolve(dirname(fileURLToPath(import.meta.url)), '../../app/components/content/go-generated/functions-catalog.json')
const BLOCK = /^::function-catalog\s*\n::\s*$/m

interface FunctionEntry {
  name: string
  call?: string
  doc: string
  factory: string
  options?: string
  variants?: string[]
  rejectCircularRefs?: boolean
}

// A pipe inside a cell, code included, must be escaped or it splits the row.
const cell = (text: string) => text.replace(/\|/g, '\\|')

function row(entry: FunctionEntry): string {
  const notes: string[] = []
  if (entry.options && !entry.variants?.length) notes.push(`Takes \`${entry.options}\`.`)
  if (entry.rejectCircularRefs) notes.push('Accepts `rejectCircularRefs`.')
  const call = `\`${cell(entry.call ?? entry.factory)}\`{lang="ts"}`
  return `| ${call} | \`${entry.name}\` | ${cell([entry.doc, ...notes].join(' '))} |`
}

export function processFunctionCatalog(body: string): string {
  if (!BLOCK.test(body)) return body
  const { functions } = JSON.parse(readFileSync(CATALOG, 'utf8')) as { functions: FunctionEntry[] }
  // Sorted by factory, so a factory's variants sit together.
  const rows = [...functions].sort((a, b) => a.factory.localeCompare(b.factory) || a.name.localeCompare(b.name))
  const table = ['| Call | Compiled Fn | What it does |', '| --- | --- | --- |', ...rows.map(row)].join('\n')
  return body.replace(BLOCK, table)
}
