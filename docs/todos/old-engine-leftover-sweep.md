# Old-engine leftover sweep — AOT / MION_COMPILE / deepkit / pure-fn / type-format residues

**Status:** todo — R35 of [migration-review-findings.md](../done/migration-review-findings.md)
(full itemized inventory lives there; this spec tracks execution); verified still fully
open 2026-07-20 (spot-checked: `purityRules.ts` present, 5 stale `virtual:mion-aot*`
declarations, devtools `"AOT"` keyword, `isMionCompileMode` live in 4 packages).
**Created:** 2026-07-20

## Problem

Everything the ts-runtypes engine now provides was intentionally replaced, but a large body
of references to the OLD engine survives in the tree: live code still wired to the
AOT/`MION_COMPILE` contract, dead protocol ends, deprecated stubs, packaging leftovers,
stale eslint rules/lists, and the whole AOT/pure-fn docs surface. Individually harmless,
collectively they misdocument the system and keep dead branches alive.

## Scope (see R35 in the review findings for the exact file/line inventory)

1. **Live-but-dead code paths first:** `isMionCompileMode()`/`isMionAOTEmitMode()` + the
   platform `listen()` skips + `router.ts` IPC send (no listener exists); `AOTCacheError`
   stub; `defaultRoutes.ts` AOT docblock; test-server edge/cloudflare `MION_COMPILE` blocks
   + dead `aot: true` options; `virtual-modules.d.ts` deleted-module declarations
   (`virtual:mion-aot/*`, `virtual:mion-server-pure-fns`).
2. **Packaging/config:** devtools `"AOT"` keyword + `clean:aot-caches` script; run-types
   `browser` map of a deleted file + `"deepkit"` keyword; platform-bun deepkit devDeps
   (pending [platform-bun-runtypes-lane.md](platform-bun-runtypes-lane.md)); root/core
   tsconfig `reflection`/decorator flags (verify unused first).
3. **Old pure-fn surface:** `devtools/src/pureFns/purityRules.ts`; the `pure-functions`
   eslint rule + the `pureServerFn`/`registerPureFnFactory` branches of `no-vite-client`
   (keep only the serverMapFrom branch) + their specs.
4. **Old type-format surface:** core `formats.types.ts`/`formatsParams.types.ts` deepkit-era
   twins (align with or re-export ts-runtypes'); `formatTypeNames.ts` eslint list (remove
   deleted names, ADD `FormatCurrency`/`FormatDomainUnicode`/`FormatDomainPunycode` — their
   absence silently breaks the import-type guard); stale registration comments.
5. **Comment hygiene** per the R35 list; sunset plan for the accepted-and-ignored
   `aotCaches`/`serverPureFunctions` plugin options.

Examples + website leftovers ride [examples-and-website-refresh.md](examples-and-website-refresh.md).

## Fix plan

Execute buckets 1→4 in one dedicated PR (mechanical deletions + comment rewrites), full
suite green after each bucket; bucket 5 rides along. Keep `docs/done/` references intact
(legitimately historical).
