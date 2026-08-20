# Sunset the accepted-and-ignored `aotCaches` / `serverPureFunctions` plugin options

**Status:** todo — deliberate deprecation window (NOT a leftover to remove now). Split out of
[old-engine-leftover-sweep.md](../done/old-engine-leftover-sweep.md) so the sweep can close.
**Created:** 2026-07-21

## Problem

`mionVitePlugin` (`packages/devtools/src/vite-plugin/mionVitePlugin.ts`) still declares the legacy
options `aotCaches?` and `serverPureFunctions?` (plus `runTypes.compilerOptions`/`include`/`exclude`/
`reflectionMode`). They are **accepted and ignored** since the ts-runtypes migration, with a one-time
`console.warn` ("[mionVitePlugin] legacy options … are ignored since the ts-runtypes migration").

This is intentional back-compat: existing user configs that still pass these options keep building,
just with a deprecation notice, instead of hard-failing on an unknown-property error.

## Fix plan (deferred by design)

Keep the warn-and-ignore shim for **one published release** so consumers get a migration window, then:

1. Remove the `aotCaches` / `serverPureFunctions` fields from `MionPluginOptions` and the
   `compilerOptions`/`include`/`exclude`/`reflectionMode` fields from `MionRunTypesOptions`.
2. Remove the `legacyOptionsNoticeShown` warn block.
3. Note the removal in the release/CHANGELOG so a stale config now fails loudly (as an unknown-property
   error) rather than silently — the intended end state.

## The window has NOT started yet (verified 2026-08-20)

Do not act on this because a release happened — check WHICH release.

- `@mionjs/devtools@0.8.10` (the current `latest` on npm) was published **2026-05-06T15:30:42Z**.
- The warn-and-ignore shim landed in **`bb9f36f`**, committed **2026-07-21** — two and a half months
  AFTER that publish, in the same commit that bumped the version to 0.8.10 locally.

So no published release contains the shim: consumers on 0.8.10 still get the options' original
behaviour with no deprecation notice at all. **The window opens at the first release published
after `bb9f36f`**, and the removal lands one release after that.

Re-verify the same way before acting: `npm view @mionjs/devtools time --json` against
`git show -s --format=%ci bb9f36f`.

## Why it's tracked separately

It is a scheduled deprecation, not dead code: removing the options today would pull a documented
(if ignored) option out from under users with no deprecation cycle. Everything else in the old-engine
sweep is genuinely dead and has shipped.
