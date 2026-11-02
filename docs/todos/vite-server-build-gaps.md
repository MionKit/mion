---
type: fix
spec: guidelines
status: ready
created: 2026-11-02
---

# `server.build` and preview gaps in the Vite preset

## Intent

The two-bundle Vite build is the cleanest 0.13 story for a fullstack app, but porting the mion-starters showed it
fits only a single-entry SPA. Investigation in the mion-starters repo, `docs/investigations/mion-0.13-migration/`
(README rows 16-17, `vue.md` issues 6-9, `nuxt.md` issues 6, 22).

1. **One entry, silent overwrite.** `server.build` emits only `server.entry`; a user
   `environments.ssr.build.rollupOptions.input` is overwritten without a warning. A starter with node, bun, vercel
   and cloudflare entries needs a hand-written `configEnvironment` plugin.
2. **`public/` copied into the API bundle** (`dist-server/` gets favicons and robots.txt).
3. **Hosts that own the SSR environment.** In Nuxt, `server.build` replaces Nuxt's own SSR bundle: `nuxt build`
   exits 0, then every page answers 500 (`Cannot find module .nuxt/dist/server/server.mjs`). The docs list Nuxt
   under "Fullstack Apps".
4. **`vite preview` does not serve the API** (no `configurePreviewServer`).
5. **`mion-pure-fns/` in the public `outDir`.** Every build writes `<outDir>/mion-pure-fns/index.json` with source
   file paths and mapper ids, so a static CDN deploy publishes them.

## Direction

The implementer plans the fixes. Verified pointers:

- `packages/devtools/src/vite/mionVitePlugin.ts:195-221` (the `config` hook, `order: 'post'`) and `:254-279`
  (`serverBundlePlugin`). Options: accept several entries, or keep an existing input; set `copyPublicDir: false`
  on the server environment; detect a host that already owns `ssr` and fail with a clear message.
- `packages/devtools/src/core/unplugin.ts:619-640` (pure-fn artifact): decide whether an app build should emit it at
  all, and never into a client `outDir`.
- Preview: mount the built API in `configurePreviewServer`, or document a proxy.

## Docs

`container/website/content/01.rpc/07.devtools/02.vite.md` "One Config, Two Bundles", "Fullstack Apps" (which hosts
`server.build` fits) and "All Plugin Options".

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A project with several API entries builds them from one config without a custom plugin, the API bundle holds no
  `public/` files, a host that owns `ssr` gets a clear error instead of a broken build, and no pure-fn artifact
  lands in the client output; each pinned by a test.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
