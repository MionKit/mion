# One Nuxt install, two sites: fold mion's website into the container (merge master plan, step 4)

**Status:** open
**Created:** 2026-08-24

Step 4 of [merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md).
Requires [unify-workspace-and-toolchain.md](unify-workspace-and-toolchain.md) landed. Goal
(settled decision 3): the single `container/website/` Nuxt codebase builds TWO separate static
sites — mion.pages.dev and runtypes.pages.dev, both Cloudflare Pages — and the host-run
`website/` directory plus the GitHub Pages deploy are retired.

## Owner actions

- Create the Cloudflare Pages project for mion.pages.dev and confirm the existing
  `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets cover both projects.

## Tasks

- **Site selector.** Add an `RT_SITE=runtypes|mion` switch (registered in the env REGISTRY) read
  by `nuxt.config.ts` and the website build scripts. It picks per site: the content tree, the
  app.config (nav, github block, socials, branding), and public assets (favicons, banners,
  redirects). Components, layouts, server utils (code-import, twoslash, highlighter) and the
  playground stay shared. The two content trees are NOT merged — the runtypes docs stay as they
  are; mion's dirs (`introduction`, `server`, `drizzle-orm`, `client`, `run-types`, `devtools`,
  `platforms`, `benchmarks`, `articles`) become the mion site's tree.
- **Content reconciliation, mion side only:** rewrite mion's `run-types` section to introduce the
  topic and link across to the runtypes site instead of duplicating its guide; point every code
  example at the merged `packages/examples` package (both sites use `<code-import>`, so the root
  typecheck keeps both honest). Port mion's `check-links` / `check-unused-examples` /
  twoslash-test scripts where they differ from the container's own.
- **Dependencies/image.** Both sites already use Nuxt 4.4.2 + Docus 5.9.0 + @nuxt/content 3.12.0
  + the same shiki/twoslash stack; add mion-only extras to `container/website/_deps` and rebuild +
  push `tsrt-website` (`pnpm rtx container push website`). The deps-hash label mechanism enforces
  the manifests match.
- **Benchmarks pages:** the mion site's benchmark pages keep rendering from committed data for
  now — the data pipeline moves in step 8, so whatever `copy-benchmarks` produced last is checked
  in as static content until then.
- **Deletions:** `website/` (the whole host app, including its stale docus-starter name/README;
  move `.vscode-extension/` into the container app only if still wanted), the root `pages-build` +
  `copy-benchmarks` scripts, and `.github/workflows/nuxtjs.yml` (GitHub Pages deploy retired).
- **Deploy:** extend `website-deploy.yml` and `scripts/website/build.mjs` to build and deploy both
  sites (two `wrangler`/Pages targets, same guard rules: `verify-live` before publishing docs for
  a released version).

## Done criteria

- `pnpm rtx website dev` (or the site script's site flag) serves either site locally from the
  container; `pnpm rtx website build` produces both static outputs and `check-static` passes for
  each.
- Both Cloudflare Pages projects deploy from `website-deploy.yml`; the GitHub Pages workflow is
  gone; `website/` is gone.
- Repo-wide grep finds no reference to the deleted host `website/` paths.
