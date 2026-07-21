# Old-engine leftover sweep — AOT / MION_COMPILE / deepkit / pure-fn / type-format residues

**Status:** done — R35 of [migration-review-findings.md](migration-review-findings.md). Shipped across
PR3 (self-contained buckets), PR #126 (`MION_COMPILE`/`isMionCompileMode`), and the eslint-cleanup PR
(dead eslint surface). The one intentional deferral — the plugin-option deprecation sunset — is tracked
separately in [plugin-legacy-option-sunset.md](../todos/plugin-legacy-option-sunset.md).
**Created:** 2026-07-20

## Shipped in PR3

- **Dead AOT code paths:** removed `isMionAOTEmitMode()` (core) + the dead `router.ts` IPC send
  (`setPlatformConfig` no longer emits `mion-platform-ready` — no listener existed); removed the
  `AOTCacheError` stub (`router/lib/reflection.ts`); removed the `MION_COMPILE` auto-init blocks +
  invalid `aot: true` options from `test-server-edge.ts`/`test-server-cloudflare.ts`; rewrote the
  stale AOT docblock in `defaultRoutes.ts`.
- **Virtual modules:** pruned the dead `virtual:mion-aot/*` and `virtual:mion-server-pure-fns`
  declarations from `devtools/.../virtual-modules.d.ts`; kept the live `virtual:mion/server-mappers`.
- **deepkit/config:** removed root `tsconfig.json` `emitDecoratorMetadata`/`experimentalDecorators`
  (no decorators in the tree) + `reflection`; removed the per-package `reflection` flag from every
  package EXCEPT platform-bun (PR2) and examples (PR1); removed the deepkit vite externals
  (`run-types/vite.config.ts`, `devtools/vite.vite-plugin.config.ts`) and aliases
  (`test-server/vite.{edge,cloudflare}.config.ts`); removed the broken `deepkit-install` call from
  `setup.sh`.
- **Packaging:** removed the devtools `"AOT"` keyword + `clean:aot-caches` script (and its use in
  build/clean); removed the run-types `"deepkit"` keyword + the dead `browser` map of a deleted file.
- **Type-format eslint:** fixed the deepkit-era docblock in `formatTypeNames.ts` and ADDED the missing
  `FormatCurrency`/`FormatDomainUnicode`/`FormatDomainPunycode` (their absence silently let `import type`
  of those slip past the import-type guard).

Full suite green after the sweep (core/run-types/type-formats/devtools/router/client/platform-* — 1134 tests).

## Shipped in PR #126 (with the platform-bun port)

- **The whole `MION_COMPILE`/`isMionCompileMode` contract is gone.** Removed `isMionCompileMode()`
  from core; the `listen()`/`Bun.serve()` skips from `platform-node/mionHttp.ts` +
  `platform-bun/bunHttp.ts`; the `isMionCompileMode()` OR in `router.ts` `shouldFullGenerateSpec()`
  (now just `getPublicRoutesData || GENERATE_ROUTER_SPEC`); the `MION_COMPILE` tests in
  `platform-node/mionHttp.spec.ts` + `platform-bun/bunHttp.test.ts`; and the
  `'@deepkit/type-compiler': false` entry from `pnpm-workspace.yaml` `allowBuilds` (deepkit is fully
  gone). NOTE: `isMionCompileMode` also gated `middleware` mode's listen-skip — when that mode is
  restored ([vite-plugin-ssr-middleware-mode.md](../todos/vite-plugin-ssr-middleware-mode.md)) it
  needs its own in-process path (call the platform `httpRequestHandler` directly, not `startNodeServer`).

## Shipped in the eslint-cleanup PR (unblocked once PR #125 merged)

- **Deleted the `no-typeof-runtype` rule entirely** (rule + spec + registration + recommended-config
  entry) plus the docs that presented `typeof` as an anti-pattern (`5.devtools/2.eslint-rules.md`,
  `4.run-types/4.caveats.md`). The `typeof` restriction was a deepkit reflection limitation; ts-runtypes
  resolves `typeof x` at build time, so the rule guarded a non-issue.
- **Migrated the pure-fn eslint surface off the removed `pureServerFn`/`registerPureFnFactory`.**
  `purityRules.ts`, the `pure-functions` rule and the `no-vite-client` rule now key on the live APIs:
  `pure-functions` validates purity of `serverMapFrom` mappers AND `registerMionPureFn` factories;
  `no-vite-client` keeps only the `serverMapFrom` by-name contract. Specs rewritten; devtools suite
  green (224 tests), `build/` rebuilt.

The one deliberately deferred item — the accepted-and-ignored `aotCaches`/`serverPureFunctions`
plugin-option sunset (a deprecation window, not dead code) — moved to its own spec:
[plugin-legacy-option-sunset.md](../todos/plugin-legacy-option-sunset.md).
