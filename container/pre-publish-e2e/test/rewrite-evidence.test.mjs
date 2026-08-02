// Static assertions over the dist BYTES: prove the RunTypes plugin actually
// transformed the source inside each bundler (not silently no-op'd). Three checks
// per app:
//   1. No residual un-rewritten generic marker calls (`createValidateFn<…>`,
//      `getRunTypeId<…>`) survive — the transform + TS strip removed them.
//   2. The injected cache wiring is present (the `__rt_` tuple bindings the
//      rewrite threads into each call site), so the output carries generated code.
//   3. The `@ts-runtypes/core/json-schema` SUBPATH specifier survived into the
//      bundle, proving that export resolved out of the packed tarball here.
//
// Check 3 covers what 1 and 2 cannot. `@ts-runtypes/core` and its subpaths are
// external in every app (`CORE_EXTERNAL` in build-all.mjs), so a subpath the
// packed tarball failed to export would break the build outright rather than
// reaching the dist — and until this check existed, no app imported a subpath at
// all, which is how `formats/temporal` went uncovered.
//
// What is deliberately NOT asserted here: that each individual BUILDER-form call
// site (`runTypeFromJsonSchema({…})`) carries an injected `__rt_…` trailing argument. That
// was tried and is not a sound byte-level check, for two independent reasons:
//   - Not every builder call needs its own id. A nested one whose result feeds
//     another marker call — `RT.partial(runTypeFromJsonSchema(SCHEMA))` — is folded into the
//     outer site and correctly emerges as a bare `runTypeFromJsonSchema(SCHEMA)`. A byte
//     check cannot tell that apart from a site the plugin skipped.
//   - The callee spelling is bundler-specific. webpack emits the indirect
//     `(0, ns.runTypeFromJsonSchema)(…)` form, so a `runTypeFromJsonSchema(` needle finds nothing at
//     all in its dist.
// Builder-form injection is proven BEHAVIOURALLY instead, in build-outputs.test.mjs:
// `minimal.ts` (all six adapters) and the `json-schema` family (build-vite) both
// build validators through `runTypeFromJsonSchema(…)` and assert they discriminate and that
// their ids converge with the hand-written twin. A skipped injection cannot
// produce a working validator, so those checks fail loudly where a byte scan
// would have to guess.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = path.join(HERE, '..', 'apps');
const ALL = ['build-vite', 'smoke-esbuild', 'smoke-rollup', 'smoke-rolldown', 'smoke-webpack', 'smoke-rspack', 'smoke-source'];

// An un-rewritten generic marker call still carries its `<…>` type argument.
// After a successful transform + TS strip, no `markerName<` pattern remains.
const RESIDUAL = /\b(?:createValidateFn|getRunTypeId|getRunType|createJsonEncoderFn|createJsonDecoderFn|createBinaryEncoderFn)\s*</;

// The subpath specifier, in either module syntax an adapter may emit for an
// external (`from "…"` / `require("…")`), quoted either way.
const SUBPATH = /["']@ts-runtypes\/core\/json-schema["']/;

for (const app of ALL) {
  test(`${app}: dist shows rewrite evidence (no residual markers, injected wiring present)`, () => {
    const dist = path.join(APPS, app, 'dist/entry.js');
    assert.ok(existsSync(dist), `${app}: dist/entry.js missing`);
    const code = readFileSync(dist, 'utf8');
    assert.ok(!RESIDUAL.test(code), `${app}: found an un-rewritten generic marker call in the dist`);
    assert.ok(code.includes('__rt_'), `${app}: no injected __rt_ cache binding found — the plugin may have no-op'd`);
    assert.ok(
      SUBPATH.test(code),
      `${app}: the @ts-runtypes/core/json-schema subpath specifier is absent from the dist — the packed tarball's subpath export did not resolve`
    );
  });
}
