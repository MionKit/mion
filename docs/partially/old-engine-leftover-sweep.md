# Old-engine leftover sweep — AOT / MION_COMPILE / deepkit / pure-fn / type-format residues

**Status:** partially done — R35 of [migration-review-findings.md](../done/migration-review-findings.md).
Self-contained buckets shipped in PR3; the `MION_COMPILE`/`isMionCompileMode` (platform-bun-coupled)
bucket shipped in PR #126. Only the eslint-pure-fn cleanup + the plugin-option sunset remain (see below).
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

## Remaining (deferred)

1. **Old pure-fn eslint surface** — `purityRules.ts` dead entries (`pureServerFn`,
   `registerPureFnFactory`), the dead branches of the `pure-functions` + `no-vite-client` rules (keep
   only the `serverMapFrom` branch), and their specs. The coupling that deferred it (the examples
   fixture `introduction/eslint-pure-functions.routes.ts` + website `5.devtools/2.eslint-rules.md`)
   shipped in PR #125 (now merged), so this is **unblocked** — do it in a follow-up.
2. **Sunset plan** for the accepted-and-ignored `aotCaches`/`serverPureFunctions` plugin options
   (`mionVitePlugin.ts`) — keep the warn-and-ignore shim for one release, then remove.
