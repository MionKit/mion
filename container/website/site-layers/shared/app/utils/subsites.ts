import type {ContentNavigationItem} from '@nuxt/content'

// A site's section menu entries come from its own `shared.sections`; resolveSubsites turns the ones under the
// site's address into local links. Each id or `theme` has a theme at sites/<id>/theme.css; a mion.io section
// also has a content tree at content/<NN>.<id>/ and its home page at the section root (`path: /<id>`
// in its frontmatter). packages/devtools/test/website-theme-contracts.test.ts keeps them in step.
export interface SubsiteEntry {
  /** The `data-site` value; for a mion section also the URL segment and the content dir name. */
  id: string
  /** The word on the section menu button and its entries (exact caps: RPC, RunTypes, Benchmarks). */
  label: string
  /** The name docs page titles end with (`Validation - RunTypes`). */
  title: string
  /** The section's full address. A site-only entry may give a local path (`/cloud`). */
  url: string
  /** The home page's sidebar entry, its frontmatter `title`. Left out: no home entry is added. */
  homeTitle?: string
  icon: string
  /** Shown under the section's name in the section menu. */
  description: string
  /** Section whose colours (`sites/<theme>/theme.css`) the entry wears; default its own `id`. */
  theme?: string
}

/** A section as one site sees it. */
export interface Subsite extends SubsiteEntry {
  /** Where every link to the section goes: a local path on its own site, else the full address. */
  path: string
  /** True when the section lives on the other site. */
  external: boolean
}

/** A site's own entries (`shared.sections`), each resolved against the site's address. */
export function resolveSubsites(origin: string, entries: readonly SubsiteEntry[]): Subsite[] {
  const own = origin.replace(/\/+$/, '')
  return entries.map((entry) => {
    // `/cloud/` and `/cloud` are one section: the route path never ends with a slash.
    const url = entry.url.replace(/\/+$/, '') || '/'
    if (url.startsWith('/')) return {...entry, path: url, external: false}
    const isOwn = own !== '' && (url === own || url.startsWith(`${own}/`))
    return isOwn ? {...entry, path: url.slice(own.length) || '/', external: false} : {...entry, path: entry.url, external: true}
  })
}

/** A section menu column; entries follow the order of `ids`. */
export interface MenuColumn {
  label: string
  ids: string[]
}

/** `unknown`: the column ids that match no entry. */
export function menuColumns(
  subsites: readonly Subsite[],
  columns: readonly MenuColumn[] = []
): {columns: {label?: string; entries: Subsite[]}[]; unknown: string[]} {
  if (!columns.length) return {columns: [{entries: [...subsites]}], unknown: []}
  const ids = columns.flatMap((column) => column.ids)
  return {
    columns: columns.map(({label, ids}) => ({label, entries: ids.flatMap((id) => subsites.filter((entry) => entry.id === id))})),
    unknown: ids.filter((id) => !subsites.some((entry) => entry.id === id)),
  }
}

const isUnder = (path: string, root: string): boolean => root === '/' || path === root || path.startsWith(`${root}/`)

/** The section a route belongs to: the local one with the longest matching path, or undefined. */
export function subsiteForPath(path: string, subsites: readonly Subsite[]): Subsite | undefined {
  return subsites
    .filter((subsite) => !subsite.external && isUnder(path, subsite.path))
    .sort((first, second) => second.path.length - first.path.length)[0]
}

/** The route's `<body>` width class; a local section's home page is always wide. */
export function pageWidthClass(path: string, subsites: readonly Subsite[], wide: readonly RegExp[], flush: readonly RegExp[]): string {
  if (subsites.some((entry) => !entry.external && entry.path === path)) return 'rt-wide-page'
  if (wide.some((pattern) => pattern.test(path))) return 'rt-wide-page'
  if (flush.some((pattern) => pattern.test(path))) return 'rt-flush-page'
  return ''
}

/** Re-adds the home page its frontmatter hides (`navigation: false`) so Nuxt Content does not make it the root node. */
export function subsiteSidebar(navigation: ContentNavigationItem[] | null | undefined, subsite: Subsite | undefined): ContentNavigationItem[] {
  if (!subsite || !navigation) return []
  if (subsite.path === '/') return navigation
  const sections = navigation.find((item) => item.path === subsite.path)?.children ?? []
  const [first, ...rest] = sections
  if (!first) return []
  if (!subsite.homeTitle) return sections
  const home: ContentNavigationItem = {title: subsite.homeTitle, path: subsite.path}
  return [{...first, children: [home, ...(first.children ?? [])]}, ...rest]
}
