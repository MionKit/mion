// The current subsite, derived from the route. `subsite` is undefined on the root
// landing (and on a 404), `theme` never is: the root page paints with the first
// subsite's colours, and each intro block on it carries its own via `data-site`.
export function useSubsite() {
  const route = useRoute()
  const subsite = computed(() => subsiteForPath(route.path))
  const theme = computed(() => subsite.value ?? SUBSITES[0])
  const isRoot = computed(() => route.path === '/')
  return {subsite, theme, isRoot}
}
