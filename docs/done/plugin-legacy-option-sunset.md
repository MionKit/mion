# Sunset the accepted-and-ignored `aotCaches` / `serverPureFunctions` plugin options

**Status:** done — shipped in `b433215` (config purge) + `b20b8f7` (option removal). Split out of
[old-engine-leftover-sweep.md](old-engine-leftover-sweep.md) so the sweep could close.
**Created:** 2026-07-21

## Problem

`mionVitePlugin` declared the legacy options `aotCaches?` and `serverPureFunctions?` (plus
`runTypes.compilerOptions`/`include`/`exclude`/`reflectionMode`). They were **accepted and ignored**
since the ts-runtypes migration, with a one-time `console.warn`.

## Why the deprecation window was NOT waited out

The original plan kept the warn-and-ignore shim for one published release. That schedule was dropped
deliberately, on evidence:

- **Nobody was ever on the shim.** npm `latest` for `@mionjs/devtools` is 0.8.10, published
  **2026-05-06** — two and a half months BEFORE the shim landed (`bb9f36f`, 2026-07-21). No published
  release ever contained the notice, so no consumer could have been warned by it. All `@mionjs/*`
  packages sit at ~43–60 downloads/month, and 0.8.x carries no semver stability contract.
- **No 0.8.10 config survives the next release anyway.** The plugin now returns an array instead of a
  single plugin, `server.args` is gone, the `serverMapFrom` lane changed, and the deepkit tsconfig
  flags were deleted. The window protected a config that cannot work either way.
- **The window could not open on its own.** It was gated on "the first release published after
  `bb9f36f`", and no release could be cut: the mandatory pre-publish gate was broken by leftovers from
  the same migration. See [pre-publish-gate-repair.md](pre-publish-gate-repair.md).

## What shipped

1. **`b433215` — the repo stopped consuming the dead surface first.** 15 configs passed
   `runTypes.compilerOptions: {sourceMap: true}`, core passed a 5-entry `runTypes.include`, router an
   8-entry `runTypes.exclude`, and test-server edge/cloudflare + test-publish passed
   `aotCaches`/`serverPureFunctions`. None of it reached `@ts-runtypes/devtools`. The include/exclude
   lists needed no replacement: upstream `PluginOptions` has no include/exclude at all — scan scope
   comes from the tsconfig program. Also dropped the vestigial `server: {runMode: 'buildOnly'}` blocks
   from the three build configs, which were silently spawning a long-running child server on port 8076.
2. **`b20b8f7` — the fields were removed**, along with `'buildOnly'` from `MionServerOptions.runMode`
   (that WAS the AOT harvest mode). `'middleware'` stays in the union with its warn — restoring it is
   [vite-plugin-ssr-middleware-mode.md](../todos/vite-plugin-ssr-middleware-mode.md).

## Correction to this spec's own step 3

The original plan said removal would make a stale config "fail loudly (as an unknown-property error)".
It would not. Excess-property checking only fires on a **typed** config; a plain `vite.config.js` would
have gone from warn-and-ignore to **silently** ignored — strictly worse than the notice being deleted.

So the one-shot warn was replaced by a config-time **throw** (`assertNoRemovedOptions`) that reads the
keys through an index signature and names the replacement for each one it finds — loud in both lanes,
which is the end state the deprecation was actually aiming at. It matches the existing
`emitMode: 'functions'` throw in the same file. The guard is a 0.8 → 0.9 migration aid, marked in the
source for deletion at 1.0, and it has the test the warn never had (`removedOptions.spec.ts`, 12 cases).

## Found along the way

`mionVitePlugin` declared `extraPlugins: unknown[]` and so returned `unknown[]`, which is not
assignable to vite's `PluginOption` — that is why twelve configs across the repo carried a `}) as any`
cast, and why the plugin's own options were never typechecked at any call site. Typing the internals as
`Plugin` and the return as `PluginOption[]` let every cast go (verified with `tsc -p` against
router/core/client/test-server). Fixed in `b20b8f7`.

There is no CHANGELOG in this repo; `docs/done/` is the de-facto release record, which satisfies the
original step 3.
