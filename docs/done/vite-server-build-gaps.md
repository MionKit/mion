---
type: fix
spec: guidelines
status: done
created: 2026-11-02
---

# `server.build` and preview gaps in the Vite preset

## Intent

The two-bundle Vite build is the cleanest 0.13 story for a fullstack app. Porting the mion-starters showed where it
fails silently or leaks. Investigation in the mion-starters repo, `docs/investigations/mion-0.13-migration/`
(README rows 16-17, `vue.md` issues 6-9, `nuxt.md` issues 6, 22).

1. **Silent input overwrite.** `server.build` sets the server bundle's input to `server.entry` and overwrites a user
   `environments.ssr.build.rollupOptions.input` without a word.
2. **`public/` copied into the API bundle**: `dist-server/` gets favicons and robots.txt.
3. **Hosts that own the server build.** In Nuxt, `server.build` replaces Nuxt's own SSR bundle. `nuxt build` exits 0,
   then every page answers 500 (`Cannot find module .nuxt/dist/server/server.mjs`). The docs list Nuxt under
   "Fullstack Apps".
4. **`mion-pure-fns/` in the public `outDir`.** Every build writes `<outDir>/mion-pure-fns/index.json`, with source
   file paths and mapper ids, so a static CDN deploy publishes them.
5. **`vite preview` does not serve the API** (there is no `configurePreviewServer`).

Rechecked on 2026-11-03 against `main` (`85f3488af`): every item is still open.

Out of scope: building several API entries from one config. A real app deploys to one target, so this is not a
generic need.

## Direction

The implementer plans the fixes. Verified pointers:

- `packages/devtools/src/vite/mionVitePlugin.ts`, `serverBundlePlugin` (its `config` hook, `order: 'post'`):
  - warn or fail when an existing input would be replaced;
  - set `copyPublicDir: false` on the server environment;
  - detect a host that already owns `ssr` and fail with a clear message.
- `packages/devtools/src/core/unplugin.ts`, the `mion-pure-fns/` writer (the pure-fn artifact): decide whether an app build should emit it
  at all. It must never land in a client `outDir`.
- Preview: document how to preview the API (run the built server, proxy from `vite preview`), or mount it in
  `configurePreviewServer` if that is cheap.

## Docs

`container/website/content/01.rpc/07.devtools/02.vite.md`: "One Config, Two Bundles", "Fullstack Apps" (which hosts
`server.build` fits) and "All Plugin Options".

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A replaced input is reported, the API bundle holds no `public/` files, a host that owns `ssr` gets a clear error
  instead of a broken build, and no pure-fn artifact lands in a Vite app's client output. Each is pinned by a test.
- Previewing the API is documented or works.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Plan: generic checks, no framework code (approved 2026-11-03)

## Rule for every change

The plugin gives generic tools for any setup. No framework or metaframework names, detection or branches in code,
errors or new docs text. Checks read plain Vite signals only (`isSsrBuild`, `build.ssr`, an existing ssr input,
environment `consumer`, `build.lib`). Any framework-specific setup (Nuxt etc.) belongs in mion-starters.

## Changes

### 1 + 3. One "who owns ssr" check in `serverBundlePlugin` (`packages/devtools/src/vite/mionVitePlugin.ts`)
In the `config` hook (`order: 'post'`, uses `(userConfig, env)`), only when `env.command === 'build'`:
- `env.isSsrBuild` or `userConfig.build.ssr` set → something else already builds the server side (any tool,
  or `vite build --ssr`) → throw: `server.build` cannot run there, remove it and build the API with its own config.
- `userConfig.environments.ssr.build.rollupOptions.input` (or `.build.ssr`) already set → throw naming the input
  it would replace. Fail, not warn: a silent wrong bundle is the bug.
- Dev (`serve`) untouched, so `server.entry` middleware keeps working under any host.

### 2. `copyPublicDir: false` on the ssr environment build
Vite's own option. Vite copies its static folder (`publicDir`, whatever the app sets, `public` by default) into
every build's `outDir`. Turning it off for the server bundle keeps static files out of the API. mion assumes no
folder name or layout.

### 4. Pure-fn artifact (`packages/devtools/src/core/unplugin.ts`, vite `writeBundle`)
The artifact feeds a consumer's compiler, so only a package needs it. Skip the write when the environment is a
client app build: `this.environment.config.consumer === 'client'` and no `build.lib`. Lib builds and server
outputs keep it (existing tests stay green). Other bundlers unchanged: they have no app vs library signal.

### 5. Preview: docs only
The built API bundle inlines its own router copy and opens its own port, so mounting it inside
`configurePreviewServer` is not cheap. Document: run the built server + `preview.proxy` to it.

## Tests
- `packages/devtools/test/vite/viteEnvironments.spec.ts` (real `buildApp`, like the CLI):
  - a `public/robots.txt` lands in `dist`, not in `dist-server`;
  - a user `environments.ssr.build.rollupOptions.input` → build rejects with the input-replaced message;
  - a `build.ssr` config (host-owned server build) → build rejects with the host message;
  - dev (`serve`) with `build.ssr`-style host config does not throw (config hook called with `command: 'serve'`).
- `packages/devtools/test/pure-fn-artifact.test.ts`: a vite app build with no `build.lib` → no `mion-pure-fns/`
  in the client `outDir`, still in the ssr `outDir`.
- No fuzzing: fix, not a feature.

## Docs
- `container/website/content/01.rpc/07.devtools/02.vite.md`:
  - "Fullstack Apps": intro drops its framework list ("Nuxt, SSR, ...") so it no longer implies `server.build` fits
    them; the text stays about plain Vite signals.
  - "One Config, Two Bundles": fits a config where Vite's own `ssr` environment is free; a tool that already builds
    the server side gets a clear error (stated generically, no framework list). `public/` only in the client
    output. How to preview (built server + `preview.proxy` snippet).
  - "All Plugin Options": `build` comment notes plain Vite apps only.
- `container/website/content/02.runtypes/02.guide/09.pure-functions.md`: a client app build skips the directory.
- `packages/devtools/AGENTS.md` pure-fn artifact section: the client-app skip.

## Shipped

As planned, plus:

- "Fullstack Apps" also lost its other framework aside (where the entry may sit), for the same generic rule.
- The preview proxy lives in the page's existing example, `packages/private-examples/src/codegen/vite-client.config.ts`.
- Not mounted in `configurePreviewServer`: the built API bundles its own router and opens its own port.
- A Vite client output counts as an app when it emits an `.html` page and has no `build.lib`; a package built
  through `rollupOptions.input` keeps its artifact. Other bundlers still write it: they have no app vs library signal.
- The taken-ssr check reads `rolldownOptions.input`, `rollupOptions.input` and a string `build.ssr`
  (`build.ssr: true` names no entry, so it builds). Only `build.ssr` signals a server build, since vite derives
  `isSsrBuild` from it.
- A plugin that replaces the ssr input after mion's config hook is left alone: it does so on purpose.
