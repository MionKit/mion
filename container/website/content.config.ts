import {defineCollection, defineContentConfig, z} from '@nuxt/content'

// ONE site, THREE subsites (content/01.rpc, 02.runtypes, 03.benchmarks). Docus defines
// its `docs` + `landing` collections itself, but its `landing` collection holds only
// the root index.md. Every subsite root (content/<NN>.<id>/index.md) is a landing page
// too (app/pages/<id>/index.vue renders it through SiteLanding.vue), so the pair is
// redefined here: @nuxt/content loads one content.config.ts per layer and merges the
// collections BY NAME with the project applied last.
//
// Two things are load-bearing and must not drift:
//   - the collection NAMES. Docus' own pages/search/sitemap query 'docs' and
//     'landing' literally; rename either and the site renders empty.
//   - the include/exclude split. ANY `<dir>/index.md` is a landing page, never a docs
//     page, so a section must not use index.md for its first page.
export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: {include: '**', prefix: '/', exclude: ['**/index.md']},
      // Mirrors Docus' createDocsSchema().
      schema: z.object({
        links: z.array(z.object({
          label: z.string(),
          icon: z.string(),
          to: z.string(),
          target: z.string().optional(),
        })).optional(),
      }),
    }),
    landing: defineCollection({
      type: 'page',
      source: {include: '**/index.md', prefix: '/'},
    }),
  },
})
