// Per-site app config (nav, github block, socials, branding, SEO). `#site` is
// aliased in nuxt.config.ts to sites/<MION_SITE>, so the selected site's config is
// resolved at build time and no runtime env lookup is involved.
//
// Nuxt merges app configs with `defu` (project first, per key, recursively), so
// whatever a site leaves out still falls through to Docus' own defaults.
import siteAppConfig from '#site/app.config';

export default defineAppConfig(siteAppConfig);
