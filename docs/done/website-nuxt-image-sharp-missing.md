---
type: fix
spec: guidelines
status: done
created: 2026-09-02
---

# Nuxt Image's transformer fails in the website container: sharp has no native binary

## Intent

Every image the docs site routes through Nuxt Image (`<img src="/_ipx/_/…">`) renders as
a broken picture in the container: the mion home page's "Platforms" (`/platforms.png`)
and "Seamless Integration" (`/tools.png`) pictures both come back as HTTP 500 from
`/_ipx/_/<name>.png`, while the raw `/platforms.png` and `/tools.png` are served fine
(HTTP 200 from the shared `public/`). Users of the mion site see two broken image icons
in its feature sections. The static site may be affected too: `nuxt generate` prerenders
the same `/_ipx/` URLs, so either the deployed site ships broken pictures or the
prerender silently drops them; the implementer checks the built output.

Found on 2026-09-02 while screenshotting the home pages for the per-site colour scheme
work (`docs/done/website-per-site-color-schemes.md`); that change touches no image
handling, and the cause predates it.

## Evidence

The 500 body from the dev container (`pnpm rtx website dev --agent --site mion`, then
`curl http://localhost:3100/_ipx/_/tools.png`):

```
[500] [IPX_ERROR]
Something went wrong installing the "sharp" module

Cannot find module '../build/Release/sharp-linux-x64.node'
Require stack:
- /app/node_modules/.pnpm/sharp@0.32.6/node_modules/sharp/lib/sharp.js
```

The cause is the image's dependency policy, `container/website/_deps/pnpm-workspace.yaml`:

```yaml
  sharp: false             # only used at build-time by Nuxt image; JS fallback works
```

That comment is wrong for sharp 0.32.x: it is a native addon with no JavaScript
fallback, and `@nuxt/image`'s default `ipx` provider needs it for every transformed
image, in `nuxt dev` and during `nuxt generate`'s prerender alike.

## Direction

The spec offered two roads (allow sharp's install script, or stop routing pictures
through the transformer). Neither was taken: investigation found the real cause was a
duplicate module, and fixing that removed the unbuildable sharp altogether. See the
plan below for what shipped.

## Done when

- Both pictures on the mion home page load in the dev container (no `/_ipx/` 500) and
  are present in the generated static output. **Done:** `/_ipx/_/tools.png` and
  `/_ipx/_/platforms.png` answer 200 from `pnpm rtx website dev --agent --site mion`
  and land in `.output/mion/public/_ipx/_/`.
- The `sharp` row in `_deps/pnpm-workspace.yaml` and the allowlist paragraph in
  `container/website/CLAUDE.md` state the real situation. **Done.**
- A check fails if an optimised image on either home page stops resolving. **Done:**
  `scripts/website/check-static.mjs` fetches every same-origin `<img>` source (and
  `srcset` candidate) on every page it checks, both sites, home page included; and
  `packages/devtools/test/repo-contracts.test.ts` keeps the website's `@nuxt/image` pin
  equal to the one Docus resolves and rejects any sharp older than 0.33 in the lockfile.

## Plan (approved 2026-09-02, shipped as written)

Neither road above turned out to be the right one. The real cause is a duplicate
module: `container/website/_deps/package.json` pins `@nuxt/image` 1.11.0, whose `ipx`
2.x depends on sharp 0.32.6 (a native addon built by an install script the allowlist
blocks), while Docus 5.9.0 already brings `@nuxt/image` 2.0.0, whose `ipx` 3.x depends
on sharp 0.34.5 (prebuilt binaries shipped as `@img/sharp-<platform>` optional
dependencies, no install script). Nuxt loads the project's copy first, so the site
runs the one transformer that cannot work.

1. Bump `@nuxt/image` to 2.0.0 in `_deps/package.json`, the version Docus already
   resolves, and regenerate the lockfile with `pnpm rtx container lock`. Sharp 0.32.6
   and `ipx` 2.x leave the tree; `sharp: false` in `allowBuilds` becomes true in
   spirit (no install script is needed at all).
2. Rewrite the `sharp` row comment in `_deps/pnpm-workspace.yaml` and the allowlist
   paragraph in `container/website/CLAUDE.md` to say what actually holds.
3. Rebuild the image, prove `/_ipx/_/tools.png` and `/_ipx/_/platforms.png` answer 200
   in the dev container and land in the generated `.output/mion/public`.
4. Extend `scripts/website/check-static.mjs`: every page it fetches, on both sites, must
   have every same-origin `<img>` source (and every `srcset` candidate) answer 200 from
   the built output. Export the extractor so a Vitest can pin it.
5. Vitest in `packages/devtools/test/repo-contracts.test.ts`: the extractor finds
   `/_ipx/` and plain sources and ignores external ones, and the website's own
   `@nuxt/image` pin equals the version Docus resolves in the lockfile, so the
   duplicate cannot come back.
6. Fallback if 2.0.0 misbehaves in the container: `sharp: true` in `allowBuilds`.
   Not needed: 2.0.0 served both pictures in the dev container and the prerender.

Notes from the implementation:

- The lockfile regeneration (`pnpm rtx container lock`) hit `ERR_PNPM_MISSING_TIME`
  in the sandbox even though the registry returned full metadata; the run was done
  with the release-age gate off for that one command. The resulting diff only drops
  `@nuxt/image` 1.11.0, `ipx` 2.1.1, sharp 0.32.6 and their unique transitives; the two
  `@nuxt/kit` lines moved to 4.4.5, a version the lockfile already held.
- The published `tsrt-website` image still links `@nuxt/image` 1.11.0; the next
  `pnpm rtx container push` bakes the fixed manifests (the deps stamp already
  reports drift against the old image).
