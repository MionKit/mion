<script setup lang="ts">
// Local override of docus/app/pages/[[lang]]/[...slug].vue, copied from docus 5.9.0
// (packages/devtools/test/website-theme-contracts.test.ts pins that version to
// _deps/package.json, so a docus bump forces a re-diff against upstream). Two changes:
//   - prev/next (`surround`) is scoped to the current subsite, otherwise the last rpc
//     page links "next" to the first runtypes page;
//   - the docs title template ends with the subsite's name, not always "- mion".
// `kebabCase` from scule is replaced by a local key (scule is not a direct dep here).
import type { ContentNavigationItem, Collections, DocsCollectionItem } from '@nuxt/content'
import { findPageHeadline } from '@nuxt/content/utils'

definePageMeta({
  layout: 'docs',
})

const route = useRoute()
const { locale, isEnabled } = useDocusI18n()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')
const { shouldPushContent: shouldHideToc } = useAssistant()
const { theme: subsite } = useSubsite()
// A subsite home (content/<NN>.<id>/00.home.md) is a docs page so it sits inside the
// sidebar, but it brings its own hero: no page header above it (the fourth deliberate change).
const isSubsiteHome = computed(() => page.value?.path === subsite.value.home)

const collectionName = computed(() => isEnabled.value ? `docs_${locale.value}` : 'docs')
const pageKey = route.path.replace(/[^a-z0-9]+/gi, '-')

const [{ data: page }, { data: surround }] = await Promise.all([
  useAsyncData(pageKey, () => queryCollection(collectionName.value as keyof Collections).path(route.path).first() as Promise<DocsCollectionItem>),
  useAsyncData(`${pageKey}-surround`, () => {
    return queryCollectionItemSurroundings(collectionName.value as keyof Collections, route.path, {
      fields: ['description'],
    }).where('path', 'LIKE', `${subsite.value.path}/%`)
  }),
])

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

const title = page.value.seo?.title || page.value.title
const description = page.value.seo?.description || page.value.description

const headline = ref(findPageHeadline(navigation?.value, page.value?.path))
const breadcrumbs = computed(() => findPageBreadcrumbs(navigation?.value, page.value?.path || ''))

useSeo({
  title,
  description,
  type: 'article',
  modifiedAt: (page.value as unknown as Record<string, unknown>).modifiedAt as string | undefined,
  breadcrumbs,
})
useHead({ titleTemplate: `%s - ${subsite.value.title}` })
watch(() => navigation?.value, () => {
  headline.value = findPageHeadline(navigation?.value, page.value?.path) || headline.value
})

defineOgImage('Docs', {
  headline: headline.value,
  title: title?.slice(0, 60),
  description: formatOgDescription(title, description),
})

// No "edit this page / report an issue" footer (the fifth deliberate change): the
// site's pages end with their content and the prev/next links.

// Add the page path to the prerender list
addPrerenderPath(`/raw${route.path}.md`)
</script>

<template>
  <!-- data-site on the page markup itself (the third deliberate change): the page
       paints in its subsite's colours from its own DOM, not only from <html>. -->
  <div
    v-if="page"
    :data-site="subsite.id"
    class="site-page"
  >
  <UPage
    :key="`page-${shouldHideToc}`"
  >
    <UPageHeader
      v-if="!isSubsiteHome"
      :title="page.title"
      :description="page.description"
      :headline="headline"
      :ui="{
        wrapper: 'flex-row items-center flex-wrap justify-between',
      }"
    >
      <template #links>
        <UButton
          v-for="(link, index) in (page as DocsCollectionItem).links"
          :key="index"
          size="sm"
          v-bind="link"
        />

        <DocsPageHeaderLinks />
      </template>
    </UPageHeader>

    <UPageBody>
      <ContentRenderer
        v-if="page"
        :value="page"
      />

      <UContentSurround :surround="surround" />
    </UPageBody>

    <template #right>
      <DocsAsideRight
        :page="page"
      />
    </template>
  </UPage>
  </div>
</template>
