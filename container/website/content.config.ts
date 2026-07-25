import { defineContentConfig, defineCollection, z } from '@nuxt/content'

// Overrides Docus's built-in `docs` collection purely to add `6.suites` to the
// exclude list, so that directory is no longer parsed, published, or navigable.
// The files stay on disk (they still feed the suite-data codegen); they are just
// not part of the site.
//
// How the override works: @nuxt/content collects a `content.config.ts` from every
// Nuxt layer, reverses the layer order (app last) and merges collections by name
// with last-write-wins (see @nuxt/content 3.x module.mjs `collectionsConfig`
// reduce). This project's rootDir config therefore replaces the same-named `docs`
// collection from the Docus layer. We only redefine `docs`; Docus's `landing`
// collection (the `index.md` home page) is left untouched, so `index.md` must stay
// excluded here to avoid it being claimed by two collections.
//
// The rest mirrors Docus's non-localized docs collection for this project (there is
// no top-level `content/docs/` folder, so include is `**` and prefix is `/`), and
// the schema replicates Docus's optional landing-style `links` field.
export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: {
        include: '**',
        prefix: '/',
        exclude: ['index.md', '6.suites', '6.suites/**'],
      },
      schema: z.object({
        links: z
          .array(
            z.object({
              label: z.string(),
              icon: z.string(),
              to: z.string(),
              target: z.string().optional(),
            }),
          )
          .optional(),
      }),
    }),
  },
})
