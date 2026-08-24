import {join} from 'node:path'
import {defineCollection, defineContentConfig, z} from '@nuxt/content'
import {SITE_DIR} from './site.config'

// ONE Nuxt install, TWO sites. Docus defines its `docs` + `landing` collections
// against a HARDCODED `<rootDir>/content` (docus/content.config.ts: `const cwd =
// joinURL(options.rootDir, 'content')`), and @nuxt/content exposes no option to
// move that directory. What it DOES support is layering: it loads one
// content.config.ts per layer and merges the collections BY NAME with the
// project applied last, so redefining `docs` and `landing` here replaces Docus'
// pair with an identical one whose `cwd` points at the selected site's tree.
//
// Two things are load-bearing and must not drift:
//   - the collection NAMES. Docus' own pages/search/sitemap query 'docs' and
//     'landing' literally; rename either and the site renders empty.
//   - the include/prefix/exclude values, copied from Docus' non-i18n branch.
//     Neither site has a `content/docs/` subdir or an `app/pages/index.vue`, so
//     Docus' `hasDocsFolder` / `hasLandingPage` are both false and this is the
//     shape it would have produced.
// Pass an ABSOLUTE cwd: @nuxt/content's `~~/` alias expansion drops the slash
// (`~~/sites/x` -> `<rootDir>sites/x`), so the alias form is a trap here.
const cwd = join(SITE_DIR, 'content')

export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: {cwd, include: '**', prefix: '/', exclude: ['index.md']},
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
      source: {cwd, include: 'index.md'},
    }),
  },
})
