# Old-engine leftover sweep — AOT / MION_COMPILE / deepkit / pure-fn / type-format residues

**Status:** partially done — R35 of [migration-review-findings.md](../done/migration-review-findings.md).
Self-contained buckets shipped on `claude/ts-runtypes-migration-todos-us21ib-engine-cleanup` (PR3);
the platform-bun-coupled and eslint-pure-fn-coupled remainder is deferred (see below).
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

## Remaining (deferred)

1. **`isMionCompileMode()` + the platform `listen()` skips (platform-node + platform-bun) +
   `pnpm-workspace.yaml` `'@deepkit/type-compiler': false`** — all anchored on the `MION_COMPILE`/deepkit
   contract that platform-bun still rides. Remove these together with
   [platform-bun-runtypes-lane.md](platform-bun-runtypes-lane.md) (PR2), where the `MION_COMPILE`
   test in `platform-node/mionHttp.spec.ts` also gets retired. `isMionCompileMode` is kept in core with
   a LEGACY docblock pointing at that spec until then.
2. **Old pure-fn eslint surface** — `purityRules.ts` dead entries (`pureServerFn`,
   `registerPureFnFactory`), the dead branches of the `pure-functions` + `no-vite-client` rules (keep
   only the `serverMapFrom` branch), and their specs. Deferred because it couples with the examples
   fixture `introduction/eslint-pure-functions.routes.ts` + website `5.devtools/2.eslint-rules.md`,
   both rewritten under [examples-and-website-refresh.md](examples-and-website-refresh.md) (PR1).
3. **Sunset plan** for the accepted-and-ignored `aotCaches`/`serverPureFunctions` plugin options
   (`mionVitePlugin.ts`) — keep the warn-and-ignore shim for one release, then remove.
