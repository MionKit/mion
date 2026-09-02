// ONE site, THREE subsites. This list is the single source of truth for the subsite
// switch: the header tabs and the mobile menu (AppHeaderCenter / AppHeaderBody), the
// header word next to the logo (AppHeaderLogo), the `data-site` attribute the colour
// scheme keys on (plugins/site-attr.ts), the docs title template and the prev/next
// scope ([[lang]]/[...slug].vue). Each id has a content tree at
// content/<NN>.<id>/, a theme at sites/<id>/theme.css and a landing page at
// app/pages/<id>/index.vue; packages/devtools/test/website-theme-contracts.test.ts
// keeps the four in step.
export interface Subsite {
  /** The URL segment, the content dir name and the `data-site` value. */
  id: 'rpc' | 'runtypes' | 'benchmarks'
  /** The word shown next to the mion logo and on the header tabs (exact caps: RPC, RunTypes, Benchmarks). */
  label: string
  /** The name docs page titles end with (`Validation - RunTypes`). */
  title: string
  /** The subsite root, also its landing page. */
  path: string
}

export const SUBSITES = [
  {id: 'rpc', label: 'RPC', title: 'RPC', path: '/rpc'},
  {id: 'runtypes', label: 'RunTypes', title: 'RunTypes', path: '/runtypes'},
  {id: 'benchmarks', label: 'Benchmarks', title: 'Benchmarks', path: '/benchmarks'},
] as const satisfies readonly Subsite[]

/** The subsite a route belongs to, or undefined for the root landing and unknown paths. */
export function subsiteForPath(path: string): Subsite | undefined {
  return SUBSITES.find((subsite) => path === subsite.path || path.startsWith(`${subsite.path}/`))
}

/** True when `path` is inside `subsite` (used for the active header tab). */
export const isInSubsite = (path: string, subsite: Subsite): boolean => path === subsite.path || path.startsWith(`${subsite.path}/`)
