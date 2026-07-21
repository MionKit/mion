# Sunset the accepted-and-ignored `aotCaches` / `serverPureFunctions` plugin options

**Status:** todo — deliberate deprecation window (NOT a leftover to remove now). Split out of
[old-engine-leftover-sweep.md](../partially/old-engine-leftover-sweep.md) so the sweep can close.
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

## Why it's tracked separately

It is a scheduled deprecation, not dead code: removing the options today would pull a documented
(if ignored) option out from under users with no deprecation cycle. Everything else in the old-engine
sweep is genuinely dead and has shipped.
