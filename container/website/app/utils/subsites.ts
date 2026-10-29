import type {ContentNavigationItem} from '@nuxt/content'

// ONE site, THREE subsites. This list is the single source of truth for the subsite
// switch: the header popup menu and the mobile menu (SubsiteMenu / AppHeaderBody),
// the `data-site` attribute the colour
// scheme keys on (plugins/site-attr.ts), the docs title template and the prev/next
// scope ([[lang]]/[...slug].vue). Each id has a content tree at
// content/<NN>.<id>/ and a theme at sites/<id>/theme.css. Its home page is the first page
// of its introduction section, served at the subsite root (`path: /<id>` in its
// frontmatter, so the short URL is the page, never a redirect); see subsiteSidebar.
// packages/devtools/test/website-theme-contracts.test.ts keeps them in step.
export interface Subsite {
  /** The URL segment, the content dir name and the `data-site` value. */
  id: 'rpc' | 'runtypes' | 'benchmarks'
  /** The word on the subsite menu button and its entries (exact caps: RPC, RunTypes, Benchmarks). */
  label: string
  /** The name docs page titles end with (`Validation - RunTypes`). */
  title: string
  /** The subsite root and its home page's URL (its about page): what a route is matched against (`/rpc/...`) and where every link to the subsite goes. */
  path: string
  /** The home page's sidebar entry, its frontmatter `title`. */
  homeTitle: string
  /** The icon on the subsite menu button and its entries. */
  icon: string
  /** One line saying what the subsite is, shown under its name in the subsite menu. */
  description: string
}

export const SUBSITES = [
  {
    id: 'rpc',
    label: 'RPC',
    title: 'RPC',
    path: '/rpc',
    homeTitle: 'About mion RPC',
    icon: 'icon-park-outline:lightning',
    description: 'Full stack TypeScript APIs. A plain function is a validated route, called from a fully typed client.',
  },
  {
    id: 'runtypes',
    label: 'RunTypes',
    title: 'RunTypes',
    path: '/runtypes',
    homeTitle: 'About mion RunTypes',
    icon: 'i-lucide-braces',
    description: 'Validation, JSON round trip, mock data and reflection, generated from your TypeScript types.',
  },
  {
    id: 'benchmarks',
    label: 'Benchmarks',
    title: 'Benchmarks',
    path: '/benchmarks',
    homeTitle: 'mion Benchmarks',
    icon: 'i-lucide-gauge',
    description: 'The RPC server and RunTypes measured against other frameworks and validators, regenerated on every deploy.',
  },
] as const satisfies readonly Subsite[]

/** The subsite a route belongs to, or undefined for the root landing and unknown paths. */
export function subsiteForPath(path: string): Subsite | undefined {
  return SUBSITES.find((subsite) => path === subsite.path || path.startsWith(`${subsite.path}/`))
}

/** True when `path` is inside `subsite` (used for the active subsite menu entry). */
export const isInSubsite = (path: string, subsite: Subsite): boolean => path === subsite.path || path.startsWith(`${subsite.path}/`)

/**
 * The sidebar of `subsite`: its sections, with its home page first in the first one. The
 * home page sits at the subsite root, so Nuxt Content would make it the root node of the
 * subsite's navigation tree instead of an Introduction entry; its frontmatter takes it
 * out of the tree (`navigation: false`) and this puts it back where readers look for it.
 */
export function subsiteSidebar(navigation: ContentNavigationItem[] | null | undefined, subsite: Subsite | undefined): ContentNavigationItem[] {
  if (!subsite || !navigation) return []
  const sections = navigation.find((item) => item.path === subsite.path)?.children ?? []
  const [first, ...rest] = sections
  if (!first) return []
  const home: ContentNavigationItem = {title: subsite.homeTitle, path: subsite.path}
  return [{...first, children: [home, ...(first.children ?? [])]}, ...rest]
}
