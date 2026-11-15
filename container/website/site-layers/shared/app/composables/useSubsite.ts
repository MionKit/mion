import type {ContentNavigationItem} from '@nuxt/content'

// `subsite` is undefined on a page outside every local section (mion's root landing, a 404),
// `theme` never is: such a page paints with the first local section's colours.
export function useSubsite() {
  const route = useRoute()
  const {shared} = useAppConfig()
  const subsites = computed(() => resolveSubsites(shared.origin ?? '', shared.sections))
  const subsite = computed(() => subsiteForPath(route.path, subsites.value))
  const theme = computed(() => subsite.value ?? subsites.value.find((entry) => !entry.external) ?? subsites.value[0]!)
  // A site with no local section keeps Docus' whole navigation tree.
  const hasLocal = computed(() => subsites.value.some((entry) => !entry.external))
  const sidebar = (navigation: ContentNavigationItem[] | null | undefined): ContentNavigationItem[] =>
    hasLocal.value ? subsiteSidebar(navigation, subsite.value) : (navigation ?? [])
  return {subsites, subsite, theme, sidebar}
}
