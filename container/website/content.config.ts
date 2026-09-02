import {defineCollection, defineContentConfig, z} from '@nuxt/content'

// ONE site, THREE subsites (content/01.rpc, 02.runtypes, 03.benchmarks). Docus defines
// its `docs` + `landing` collections itself; the pair is redefined here so the
// include/exclude split is spelled out: @nuxt/content loads one content.config.ts per
// layer and merges the collections BY NAME with the project applied last.
//
// The `landing` collection holds only the root index.md. Each subsite's home is a DOCS
// page (content/<NN>.<id>/00.home.md), so it renders inside the docs layout with the
// subsite's sidebar; the subsite root (/<id>) redirects to it (app/pages/<id>/index.vue
// and public/_redirects).
//
// Two things are load-bearing and must not drift:
//   - the collection NAMES. Docus' own pages/search/sitemap query 'docs' and
//     'landing' literally; rename either and the site renders empty.
//   - the include/exclude split. ANY `<dir>/index.md` is a landing page, never a docs
//     page, so a section must not use index.md for its first page (a subsite dir must
//     not carry one at all, or it would shadow the redirect to its home).
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
