// ONE site, THREE subsites. This list is the single source of truth for the subsite
// switch: the header popup menu and the mobile menu (SubsiteMenu / AppHeaderBody),
// the `data-site` attribute the colour
// scheme keys on (plugins/site-attr.ts), the docs title template and the prev/next
// scope ([[lang]]/[...slug].vue). Each id has a content tree at
// content/<NN>.<id>/ (its home page is the first page of its introduction section),
// a theme at sites/<id>/theme.css and a redirect from its root at app/pages/<id>/index.vue;
// packages/devtools/test/website-theme-contracts.test.ts keeps the four in step.
export interface Subsite {
  /** The URL segment, the content dir name and the `data-site` value. */
  id: 'rpc' | 'runtypes' | 'benchmarks'
  /** The word on the subsite menu button and its entries (exact caps: RPC, RunTypes, Benchmarks). */
  label: string
  /** The name docs page titles end with (`Validation - RunTypes`). */
  title: string
  /** The subsite root: what a route is matched against (`/rpc/...`); it redirects to `home`. */
  path: string
  /** The subsite's home page (its about page, the first docs page of the sidebar), where every link to the subsite goes. */
  home: string
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
    home: '/rpc/introduction/about-mion-rpc',
    icon: 'icon-park-outline:lightning',
    description: 'Full stack TypeScript APIs. A plain function is a validated route, called from a fully typed client.',
  },
  {
    id: 'runtypes',
    label: 'RunTypes',
    title: 'RunTypes',
    path: '/runtypes',
    home: '/runtypes/introduction/about-mion-runtypes',
    icon: 'i-lucide-braces',
    description: 'Validation, JSON and binary serialization, mock data and reflection, generated from your TypeScript types.',
  },
  {
    id: 'benchmarks',
    label: 'Benchmarks',
    title: 'Benchmarks',
    path: '/benchmarks',
    home: '/benchmarks/introduction/mion-benchmarks',
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
