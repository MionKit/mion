import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Expands `::function-catalog` to a markdown table before parsing: a component could only highlight calls at runtime.
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

// An unescaped pipe splits the row, even inside code.
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
  // Keeps a factory's variants together.
  const rows = [...functions].sort((a, b) => a.factory.localeCompare(b.factory) || a.name.localeCompare(b.name))
  // mion.css stretches each call to fill its cell through this class.
  const table = ['::div{class="fn-catalog"}', '| Call | Compiled Fn | What it does |', '| --- | --- | --- |', ...rows.map(row), '::'].join('\n')
  return body.replace(BLOCK, table)
}
