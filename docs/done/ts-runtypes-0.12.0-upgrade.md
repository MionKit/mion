# Upgrade mion to @ts-runtypes 0.12.0 — DONE

**Status:** done
**Created:** 2026-08-20

Bumped `@ts-runtypes/{core,devtools,bin}` `0.11.0 → 0.12.0` (9 pins across 7 packages, all in
`dependencies`). `minimumReleaseAgeExclude` already covers `@ts-runtypes/*`, so the 30-day policy
did not reject the day-old release. Whole suite green: 47 files / 693 tests.

The upgrade carried two things: the `CompiledFnArgs` fix (its own record —
[upstream-compiledfnargs-type-lie.md](upstream-compiledfnargs-type-lie.md)) and a **breaking change
to the plugin option surface**, below.

## Surface audit (verified against the published tarballs, not release notes)

- **Root export and `/formats` are purely additive.** `InferType` moved internally from
  `./schema/static.ts` to `./builders/static.ts` but is exported under the same name from the same
  entry point. mion imports only `@ts-runtypes/core` (64 sites), `/formats` (29), and devtools'
  `.` + `/vite` — never `/schema` or `/builders` — so the relocation cannot reach it.
- **`FormatName` grew 18 → 20** (`formattedArray`, `formattedObject`); nothing removed. Nothing in
  mion is exhaustive over `FormatName`, so no build breakage.
- **`fnHashes.generated.ts` gained one entry (`jsonSchema`); no existing hash changed.** So
  `JIT_FUNCTION_IDS` stays stable and the wire format for existing families is untouched.
- **New and unadopted:** `builders/`, `jsonShape.ts`, `stripRunTypeMeta.ts`, `createJsonSchemaFn` +
  the standard-schema JSON Schema converter, structural formats, `markers: {packages,
  checkPackage}`, and the `size` → `binarySizing` rename. mion passes none of these today.

## BREAKING: `allowUncheckedPatterns` removed, pattern checking replaced

`@ts-runtypes/devtools` 0.12.0 **deleted `allowUncheckedPatterns`** from `PluginOptions`. It was
not renamed — the concept it existed for was retired.

Before 0.12.0, pattern checks ran through RE2, so any pattern using a JS-only regex feature
(unicode escapes, lookarounds, backreferences) was *uncheckable*, and `allowUncheckedPatterns: true`
suppressed FMT004 to let it ship unverified. 0.12.0 runs the checks on a **real JS engine sidecar**
— the same `new RegExp` the emitted validator uses at runtime — so nothing is uncheckable and the
escape hatch has no meaning. Alongside it:

- **`mockSamples` became optional.** A pattern declaring none gets a pool generated from the regex
  at build time. Declared samples always win over generation.
- **`patternSampleCount`** — how many samples to generate. **`patternSampleRetries`** — retries
  before failing; the budget is `patternSampleCount × patternSampleRetries`.
- **FMT005** (new): generation produced nothing — disabled, an unhandleable construct (lookarounds
  are the usual case), or budget exhausted. **FMT006** (new): two sites share a cache entry but
  declare different pools.
- **FMT004 changed meaning** — it now reports "no JS runtime could be started", not "RE2 can't
  compile this". node and bun are found automatically on PATH; otherwise upstream takes
  `--js-runtime` or `RT_JS_RUNTIME`.

### What mion did

Dropped `allowUncheckedPatterns` outright — no warn-and-ignore shim. A deliberate call by the
maintainer: the upstream capability is genuinely gone rather than renamed, so a shim would accept an
option that could no longer do anything. `MionRunTypesOptions` instead gained `patternSampleCount`,
`patternSampleRetries` and `jsRuntime`, all typed off upstream and passed through undefined so
upstream's own defaults apply (`failOnError` remains the one field mion deliberately defaults).
`jsRuntime` is exposed for the same reason `binary` already is — otherwise a consumer hitting FMT004
has no way to point mion at a runtime; upstream's `RT_JS_RUNTIME` env var remains the other lane,
per [retire-ts-runtypes-bin-env-var.md](retire-ts-runtypes-bin-env-var.md).

`website/content/5.devtools/3.vite-config.md` updated to match.

### Proof the sidecar actually runs

`packages/devtools/src/vite-plugin/patternSidecar.spec.ts` — mion declares no format patterns of its
own, so without these tests the new options would be forwarded but never exercised:

1. **JS-only regex features compile and validate.** A backreference (`^(\w+)-\1$`) and a
   lookbehind+lookahead (`(?<=\$)\d+(?=\.00$)`) — precisely what `allowUncheckedPatterns` used to
   wave through — now compile and accept/reject correctly at runtime.
2. **Generated samples are real and valid.** For a pattern declaring no `mockSamples`, every
   generated entry matches `new RegExp(source, flags)` — the sidecar validating its own output.
3. **`patternSampleCount` is honoured**, asserted against a deliberately non-default 7 set in
   `packages/devtools/vitest.config.ts`.
4. **Declared samples win** over generation.

Assertions read the pool off the run-type's `formatAnnotation` (`params.pattern.mockSamples`) —
the same slot `mockStringParams` → `patternSampleList` draws from at runtime, so they test the real
path. The count assertion was validated as a genuine guard: changing the config to 4 fails it with
`expected [ 'fov-73', 'lsh-49', 'mjm-95', …(1) ] to have a length of 7 but got 4`.

**Fixed along the way:** `packages/devtools/vitest.config.ts` pointed the resolver at the ROOT
`tsconfig.json`, which is solution-style (`files: []`, references only) — so its scan program was
empty and the transform never injected anything into devtools specs. Repointed at
`packages/devtools/tsconfig.json`, matching every other package's config. This was latent: no
devtools spec had needed reflection before.

## Not covered here

- Anything drizzle — deferred to a separate full investigation at the maintainer's request.

## Failure paths are guarded too

The negative cases — bad `mockSamples` (FMT003), an ungeneratable pattern (FMT005), and clashing
pools on a shared cache entry (FMT006) — each get a test that runs a real vite build expected to
FAIL and asserts on the diagnostic code. `patternSampleRetries` is guarded there too, though more
weakly: the retry budget turns out to have no provokable effect on generation, so the test pins the
passthrough (the resolver rejects a value below 1) rather than the budget. See
[build-failure-test-harness.md](build-failure-test-harness.md).
