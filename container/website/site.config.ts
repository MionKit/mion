import {fileURLToPath} from 'node:url'

// ONE Nuxt install, TWO sites. MION_SITE picks which one is being built or served:
// its content tree, its app.config (nav, github block, socials, branding) and its
// public assets. Everything else — components, layouts, server utils, the
// playground — is shared. Read by nuxt.config.ts and content.config.ts.
//
// Registered in the env REGISTRY (scripts/lib/env.mjs) and passed into the
// container by scripts/website/site.mjs.
export const SITES = ['runtypes', 'mion'] as const

export type Site = (typeof SITES)[number]

const requested = process.env.MION_SITE || 'runtypes'
if (!(SITES as readonly string[]).includes(requested)) {
  throw new Error(`MION_SITE must be one of ${SITES.join(' | ')}, got '${requested}'`)
}

export const SITE = requested as Site

/** Absolute path of the selected site's dir (content/, public/, app.config.ts, Logo.vue). */
export const SITE_DIR = fileURLToPath(new URL(`./sites/${SITE}`, import.meta.url))
