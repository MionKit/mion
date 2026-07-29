---
type: feature
spec: full-plan
status: ready
created: 2026-07-29
---

# Auto-generate pattern mockSamples from the regex (build time, randexp-style)

> **Depends on:** `pattern-validation-js-engine-sidecar.md` — reuses its `internal/jsengine` engine and sidecar protocol. Land that first.

## Problem

Every pattern must ship hand-written `mockSamples` today: `StringPatternArgs.mockSamples` is required (`packages/ts-runtypes/src/runtypes/formatPattern.ts:33`), the type surface rejects a samples-less `{source, flags}` (`test/types/typesafety.test.ts:135-137` pins it with `@ts-expect-error`), and the mock walker throws when a pattern has no usable samples (`src/mocking/mockStringFormat.ts:83-88`). That requirement existed because we assumed values could not be derived from a regex — wrong: randexp-style generation (parse the regex, walk it emitting conforming strings) is well-established. Generating N samples at build time removes the authoring burden while keeping user-declared samples authoritative.

## Design

**Where generated samples land (user-confirmed): the generated cache modules' `formatAnnotation` — never the source.** The mock walker reads only the annotation (`ts-go-runtypes/internal/cachegen/runtype/module.go:350-360` `writeFormatAnnotation` emits `<ref>.formatAnnotation = {…}`; consumed at `src/mocking/mockType.ts:168-174` → `mockStringFormat.ts:65-90` draw precedence). Rewriting call-site source could never reach it: the annotation is assembled from params recovered at scan time, so `sourcerewrite` is not involved at all.

**Generation is downstream of id computation — typeIDs stay stable.** Format params, `mockSamples` included, fold into the typeID (`typeid/formats.go:392`, recovery `:139-163` type channel / `:320-386` AST channel). A pattern declared WITHOUT samples hashes without them; generated samples are merged into the annotation only, after the id exists. Consequences, all desirable: changing the count knob never re-hashes types; two sample-less uses of the same pattern share one entry and one generated pool; declaring explicit samples changes the id exactly as it does today.

**Generation runs in the #1 sidecar with a bundled randexp.** JS regexes deserve a JS-semantics generator; the sidecar already executes under node/bun. Add op `generate` to the sidecar protocol: `{id, op:'generate', source, flags, count, seed, maxLength?}` → `{id, values, error}`. `randexp` (plus its transitive `ret`/`drange`) becomes a root devDependency (exact-pinned, root-level per workspace policy; mind `minimumReleaseAge` when adding) bundled into the sidecar at codegen time — **never a runtime dependency of user projects**.

**Determinism is mandatory** (reproducible builds, stable disk cache, no diff churn): seed = 32-bit hash of `(source, flags, count)`; the sidecar overrides randexp's `randInt` with a mulberry32 PRNG seeded from it (same PRNG family as `test/fuzz/core/seededRng.ts`; the sidecar keeps its own bundled copy). No `Date.now`/`Math.random`. The binary's `constants.Version` already fingerprints the disk cache, covering generator-algorithm changes across releases.

**Ungeneratable patterns degrade to today's behavior.** randexp cannot honor lookarounds and similar constructs. The sidecar therefore self-checks: every generated value is tested against the real compiled `RegExp`, non-matching values are dropped, and if the yield is too low the job returns an error. Go then emits a new **FMT005** ("could not auto-generate mockSamples for this pattern — declare them explicitly"), which is precisely the status quo requirement, now scoped to only the patterns that need it.

**Length-bounds interplay.** Generated values must survive the same sibling-bounds filter as declared ones (`pattern.go:181-232` `lengthSurvivors`/`sampleDrawPool` mirror `mockStringFormat.ts` `filterSamplesByLength`; UTF-16 code-unit lengths). Generation passes min/max length hints (randexp's `max` bounds unbounded quantifiers), then filters; an empty survivor set ⇒ FMT005 (not FMT003 — that code keeps meaning "your declared samples all violate the bounds").

**The count knob: `patternSampleCount`, default 100, `0` disables generation.** Session-constant config ⇒ spawn flag + tsconfig key, never a `protocol.Request` field (`docs/todos/protocol-startup-config-audit.md` governing principle). It follows the `hashLength` trace end-to-end:

- JS: `PluginOptions.patternSampleCount?: number` (`unplugin.ts:133-136` idiom) + guarded spawn spread (`unplugin.ts:376`) + `plugin-option-keys.ts` row + `ResolverClientOptions` + `buildResolverArgs` push `--pattern-sample-count` (`resolver-client.ts:556`).
- Go: `tsRuntypesPlugin.PatternSampleCount *int` in `cmd/ts-runtypes/config.go` (pointer = absent-vs-zero, `:48-53`; regenerates `tsconfig-plugin-keys.generated.ts` via `pnpm rtx core codegen pluginkeys`), `sharedFlags` IntVar in `main.go:139-168`, merge clause in `buildconfig.go:94-96` shape (flag > tsconfig > default 100), `resolver.Options.PatternSampleCount`.
- **Disk cache:** the knob changes emitted module bytes, so it joins `diskcache.FingerprintInputs` (`resolver.go:350`, `fingerprint.go:20,66` — the `HashLength` precedent).

**Type-surface relaxation (JS package):**

- `StringPatternArgs.mockSamples` → optional (`formatPattern.ts:33`); `FormatPattern.mockSamples` optional accordingly (`:48`); `registerFormatPattern` skips the validation loop when absent (`:64-75`).
- Flip the `@ts-expect-error` on samples-less `{source, flags}` (`typesafety.test.ts:137`); the bare-`RegExp` rejection (`:135`) stays (type-first still needs literal types).
- **Runtime-only usage (no build step) keeps throwing at mock time** — update the message at `mockStringFormat.ts:83-88` to say samples are auto-generated by the build and must be declared when building without the plugin. Validation is unaffected (uses the regex directly).
- **Built-in patterns keep their explicit samples** (`src/formats/string/string-patterns.ts`, 13 registrations) — removing them would change built-in typeIDs and they ride the published `.d.ts` as literals. Note: a library publishing a samples-less `FormatPattern` in its `.d.ts` still works — generation happens in the CONSUMER's build, where the annotation is assembled.

## Plan

1. **Sidecar `generate` op** — bundle randexp + seeded PRNG into the existing sidecar; self-check + yield threshold; deterministic given `(source, flags, count)`. Regenerate the embedded sidecar (`codegen sidecar` lane).
2. **Go generation hook** — during render, collect pattern-bearing formats whose recovered params lack `mockSamples` (both recovery channels, `typeid/formats.go:139-163` / `:320-386` — presence check only, no id change), batch one `generate` call through `Options.JSEngine`, merge results into `FormatAnnotation.Params["pattern"].mockSamples` before `writeFormatAnnotation` (`module.go:350-360`), then run the existing bounds filtering over the effective list. Engine unavailable or job error ⇒ FMT005. `patternSampleCount: 0` ⇒ skip generation entirely (FMT005 for sample-less patterns, i.e. pre-feature behavior).
3. **FMT005** — `internal/diagnostics/codes_runtype.go` const + register, `messages.go` headline (+ detail), optional `prose.go` entry; `pnpm rtx core codegen diag` (prefix FMT already grouped in `scripts/core/gen-diagnostics-catalog.mjs` SUBSYSTEMS).
4. **Config plumbing** — the full `patternSampleCount` flow above (+ `cli-surface` help golden, `plugin-option-parity` regen, `resolver-args.test.ts`).
5. **JS type/runtime relaxation** — `formatPattern.ts`, `typesafety.test.ts`, `mockStringFormat.ts` message.

## Tests

- **Go:** typeid stability — same pattern with/without generation enabled and across count values hashes identically; declared-vs-generated still distinct ids. Render test with a fake engine: annotation carries exactly N values; bounds filtering applied; FMT005 on engine error/low yield/`count: 0`; FMT003 untouched for declared samples. Keep paired static/reflect `getRunTypeId` fixtures + hash-equivalence (marker coverage rule).
- **JS (integration, real binary + real node):** a pattern with NO `mockSamples` builds and `createMockDataFn` produces values matching the regex — asserted through both marker shapes (`getRunTypeId<T>()` and `getRunTypeId(value)`) with a convergence assert, per the rule (exemplar: `test/features/mockSoundness.test.ts:59-75`). New `format-validation` suite case (`pattern_generated`) in `test/suites/format-validation/StringFormat.ts` riding the existing 12-lane driver. Determinism: two consecutive builds emit byte-identical annotations.
- **Devtools:** cli-surface snapshot, resolver-args flag case, plugin-option parity.

## Docs

- Website: `2.guide/2.type-formats.md:121` (the "a pattern always needs mockSamples" paragraph becomes "declared samples win; otherwise the build generates them; declare explicitly for lookaround-style patterns"), `2.guide/8.pure-functions.md:17` (same claim), `2.guide/6.mocking.md:93`, `1.introduction/4.configuration.md` (new `patternSampleCount` row). Keep MDC-component/code-fence counts stable; prose only.
- `packages/examples/src/guide/custom-format-pattern.ts` — add a samples-less registration next to the existing one so the `<code-import>` blocks show both forms (compiles under the root `typecheck`).
- `docs/ARCHITECTURE.md` mock-data notes (`:250-252`) + `docs/ROADMAP.md` pattern row.

## Fuzzing

New suite `patternGen` (entry in `FUZZ`, `scripts/rt.mjs:56-67`; integration lane, needs binary + node): random patterns from a constrained pattern-generator ⇒ sidecar `generate` ⇒ **every value must match the real JS regex** (round-trip oracle) and **same seed ⇒ identical list** (do-it-twice oracle). This doubles as a standing correctness harness for the bundled randexp version.

## Out of scope

- Generating `mockSamples` for `disallowedChars` / `disallowedValues` (negative constraints stay required — `stringFormats.ts:81,99`).
- Enrichment `MockData` pools (separate system; `src/enrich/mockData.ts` has zero interaction with pattern samples).
- Touching the 13 built-in pattern registrations.
- User-facing mock RNG seeding (already shipped: `mockSeed.test.ts`, `MockRandom`).

## Done when

- [ ] A pattern with no `mockSamples` type-checks, builds, and mocks values matching the regex, covered by both `getRunTypeId` call shapes.
- [ ] Generated output is deterministic across rebuilds; typeIDs provably unaffected by the knob.
- [ ] `patternSampleCount` flows flag > tsconfig > default 100, `0` disables, and is in the disk-cache fingerprint.
- [ ] Ungeneratable patterns fail with FMT005 telling the user to declare samples; declared samples behave exactly as before.
- [ ] `pnpm test`, `go -C ts-go-runtypes test ./internal/...`, `pnpm rtx core codegen all --check`, and the `patternGen` fuzz suite green; website/examples/ARCHITECTURE/ROADMAP updated.

Estimated size: ~700 changed lines; 2 focused sessions on top of the sidecar todo.
