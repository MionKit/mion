# Upgrade mion to @ts-runtypes 0.9.2 — DONE

**Status:** done (2026-07-15, PR #123 commit `1e800445`)
**Created:** 2026-07-15

## What shipped

Bumped `@ts-runtypes/{core,bin,devtools}` `0.9.1 → 0.9.2` and adopted the upstream follow-ups
0.9.2 ships (which this migration originally filed). Whole mion suite green on 0.9.2.

- **`JIT_FUNCTION_IDS` refreshed** to the 0.9.2 per-family fn-hash prefixes (every bump
  re-hashes all families). The value-level prepareForJson/restoreFromJson transforms still
  resolve through the public `getRTFunction<'pj'>/<'rj'>` in `mionAdapter`; prefixes only
  address the full cache ENTRY for the client-metadata lane. (Version-pinning is now tracked
  as its own follow-up: [jit-function-ids-version-pinning](../todos/jit-function-ids-version-pinning.md).)
- **`mionVitePlugin` gained `failOnError` + `allowUncheckedPatterns` passthroughs.**
  `failOnError` defaults to **false** for mion — the run-types adapter wraps ts-runtypes
  pure-fn registry APIs with runtime keys, so the scanner emits benign CTA003/PFN001 that a
  strict default would fatal on every consumer (tracked as
  [failonerror-adapter-pure-fn-scanning](../todos/failonerror-adapter-pure-fn-scanning.md)). `allowUncheckedPatterns: true` on
  type-formats (its example name/city formats use unicode `\u…` escapes RE2 can't compile;
  0.9.2 FMT004 fails such patterns closed when they carry mockSamples — delegated to the JS
  lint lane).
- **Spec updates for the 0.9.2 behavior changes** (all previously filed by this migration and
  fixed upstream): generic class serializers (class-name lane covers every instantiation),
  tuple labels id-relevant (`[s:string]` ≠ `[name:string]`), and a pattern's registered
  `message` now surfaces as the format error val.
- **The four prepareForJson/restoreFromJson examples** rewritten to the public synchronous API
  (`createJsonEncoder`/`createJsonDecoder`/`createValidate`/`createMockData`). The rest of the
  deepkit-era examples remain in [examples-and-website-refresh](../todos/examples-and-website-refresh.md).

## Verification

- Whole monorepo green across all four CI batches (core, run-types, router, type-formats;
  drizze, devtools, platforms; client). `pull-request-tests` green on PR #123.
- lint 0 errors, format clean.
