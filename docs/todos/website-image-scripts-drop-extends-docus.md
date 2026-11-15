---
type: chore
spec: guidelines
status: ready
created: 2026-11-14
---

# Website image: package scripts still pass `--extends docus`

## Intent

`container/website/_deps/package.json` is baked into the website image. Four of its scripts (`start`, `dev`,
`build`, `generate`) run `nuxt … --extends docus`. Docus is now loaded by the shell layer
(`container/website/site-layers/shell/nuxt.config.ts`), and a command-line `extends` replaces the site's own list.
So these scripts load Docus alone: no shell, no parts, no content config. `container/website/playwright.config.ts`
starts its server with `npm run dev`, the same broken script. Its `check-links` script still runs
`node scripts/check-links.mts`; the file now lives at `site-layers/shell/scripts/check-links.mts`.

Nothing in the normal flow runs them: `scripts/website/site.mjs` calls `pnpm exec nuxt …` directly. They were left
as they are because any edit to that file changes the image fingerprint, which forces a local rebuild of the 3GB
image on every machine and CI run until the image is pushed again.

## Direction

- Point `check-links` at the new path and drop `--extends docus` from the four scripts, in the same change as the next planned edit to `_deps/` so the
  image is rebuilt and pushed once (`pnpm miondevx container push website`).
- Check `playwright.config.ts`: its `webServer.command` should start the site the same way `site.mjs` does, or
  only reuse a running server.
- After the scripts work again, `container/website/AGENTS.md` can list `dev`, `dev:fresh` and `build` under
  "In-container scripts" again.

## Done when

- `pnpm run dev` inside the container serves the site with its layers (header menu, mion logo, docs pages).
- The pushed image carries the new fingerprint: `pnpm miondevx website dev` pulls, never rebuilds.
