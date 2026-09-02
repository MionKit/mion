<script setup lang="ts">
// A subsite landing page (/rpc, /runtypes, /benchmarks): the `landing` collection
// entry whose path is the current route (content/<NN>.<id>/index.md), rendered with no
// docs sidebar. Mirrors docus/app/templates/landing.vue (the root `/` page) minus its
// i18n branch, which this site does not enable. Mounted by app/pages/<id>/index.vue;
// those static routes outrank Docus' catch-all, so no route ranking is involved.
const route = useRoute()

const {data: page} = await useAsyncData(`landing-${route.path}`, () => queryCollection('landing').path(route.path).first())
if (!page.value) {
  throw createError({statusCode: 404, statusMessage: 'Page not found', fatal: true})
}

const title = page.value.seo?.title || page.value.title
const description = page.value.seo?.description || page.value.description

useSeo({
  title,
  description,
  type: 'website',
  ogImage: page.value?.seo?.ogImage as string | undefined,
})
// A landing title is already the full sentence; no "- mion" suffix.
useHead({titleTemplate: '%s'})

if (!page.value?.seo?.ogImage) {
  defineOgImage('Landing', {
    title: title?.slice(0, 60),
    description: formatOgDescription(title, description),
  })
}
</script>

<template>
  <ContentRenderer
    v-if="page"
    :value="page"
  />
</template>
