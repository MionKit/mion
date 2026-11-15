import {defineCollection, defineContentConfig, z} from '@nuxt/content'
import {useNuxt} from 'nuxt/kit'
import {join} from 'node:path'

// Replaces Docus' `docs` + `landing` by name (the last layer wins): its pages, search and sitemap query those names.
// `cwd` is the CONSUMING site's content folder: left out, it would be this layer's own.
// ANY `<dir>/index.md` is a landing page, never a docs page.
const cwd = join(useNuxt().options.rootDir, 'content')

export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: {cwd, include: '**', prefix: '/', exclude: ['**/index.md']},
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
      source: {cwd, include: '**/index.md', prefix: '/'},
    }),
  },
})
