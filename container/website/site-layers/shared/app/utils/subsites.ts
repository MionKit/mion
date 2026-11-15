import type {ContentNavigationItem} from '@nuxt/content'

// The ONE section list both sites show in the header menu; resolveSubsites turns the entries under
// a site's own address into local links. Each id has a theme at sites/<id>/theme.css; a mion section
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
}

/** A section as one site sees it. */
export interface Subsite extends SubsiteEntry {
  /** Where every link to the section goes: a local path on its own site, else the full address. */
  path: string
  /** True when the section lives on the other site. */
  external: boolean
}

const SUBSITES: readonly SubsiteEntry[] = [
  {
    id: 'rpc',
    label: 'RPC',
    title: 'RPC',
    url: 'https://mion.io/rpc',
    homeTitle: 'About mion RPC',
    icon: 'icon-park-outline:lightning',
    description: 'Full stack TypeScript APIs. A plain function is a validated route, called from a fully typed client.',
  },
  {
    id: 'runtypes',
    label: 'RunTypes',
    title: 'RunTypes',
    url: 'https://mion.io/runtypes',
    homeTitle: 'About mion RunTypes',
    icon: 'i-lucide-braces',
    description: 'Validation, JSON round trip, mock data and reflection, generated from your TypeScript types.',
  },
  {
    id: 'benchmarks',
    label: 'Benchmarks',
    title: 'Benchmarks',
    url: 'https://mion.io/benchmarks',
    homeTitle: 'mion Benchmarks',
    icon: 'i-lucide-gauge',
    description: 'The RPC server and RunTypes measured against other frameworks and validators, regenerated on every deploy.',
  },
  {
    id: 'pro',
    label: 'Pro',
    title: 'Pro',
    url: 'https://pro.mion.io',
    icon: 'i-lucide-gem',
    description: 'Paid extensions to mion.',
  },
]

/** The shared list plus a site's own entries, each resolved against the site's address. */
export function resolveSubsites(origin: string, extra: readonly SubsiteEntry[] = []): Subsite[] {
  const own = origin.replace(/\/+$/, '')
  return [...SUBSITES, ...extra].map((entry) => {
    // `/cloud/` and `/cloud` are one section: the route path never ends with a slash.
    const url = entry.url.replace(/\/+$/, '') || '/'
    if (url.startsWith('/')) return {...entry, path: url, external: false}
    const isOwn = own !== '' && (url === own || url.startsWith(`${own}/`))
    return isOwn ? {...entry, path: url.slice(own.length) || '/', external: false} : {...entry, path: entry.url, external: true}
  })
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
