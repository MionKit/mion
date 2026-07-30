---
type: feature
spec: full-plan
status: done
created: 2026-07-29
completed: 2026-07-29
---

# Auto-generate pattern mockSamples from the regex (build time, randexp-style)

> **Depends on:** the pattern-validation JS-engine sidecar (LANDED — spec in `docs/done/pattern-validation-js-engine-sidecar.md`): reuses its `internal/jsengine` engine and the `@ts-runtypes/go-be-sidecar` package's `{v, jobs}` wire, which reserved the `generate` op for this todo.

## Problem

Every pattern had to ship hand-written `mockSamples`: `StringPatternArgs.mockSamples` was required, the type surface rejected a samples-less `{source, flags}`, and the mock walker threw when a pattern had no usable samples. That requirement existed because we assumed values could not be derived from a regex — wrong: randexp-style generation (parse the regex, walk it emitting conforming strings) is well-established. Generating N samples at build time removes the authoring burden while keeping user-declared samples authoritative.

## What shipped

**Sidecar `generate` op** (`packages/ts-runtypes-go-be-sidecar/src/jobs.ts`): `{id, op:'generate', source, flags, count, seed, maxAttempts, minLength?, maxLength?}` → `{id, values} | {id, generateError} | {id, compileError}`. `randexp@0.5.3` is an exact-pinned dependency of the private workspace package, bundled into the committed `sidecar.bundle.mjs` — never a runtime dependency of user projects. Determinism via randexp's documented `randInt` instance override driven by mulberry32(seed); `generator.max` bounds infinite quantifiers (maxLength hint, else 10). The SELF-CHECK is load-bearing: every candidate is tested against the real compiled `RegExp` plus the UTF-16 length bounds (randexp is lenient with impossible constructs), survivors dedupe into a Set; the whole retry budget yielding zero values ⇒ `generateError`. The stdio shell and the WASM hook share ONE `handleRequestLine` (both escape U+2028/U+2029 on responses).

**Go engine op** (`internal/jsengine`): `Engine.GeneratePattern(GenerateRequest{Source, Flags, Count, Retries, MinLength, MaxLength, SeedKey *uint32})` → `GenerateResult{CompileError, GenerateError, Values}`. The PRNG seed is FNV-1a/32 over `runKey\x00source\x00flags\x00count` (pinned constants in `wire_test.go`): the pattern content keeps distinct patterns on distinct streams, and the RUN KEY decides reproducibility (user amendment — pools are random by default). A nil `SeedKey` uses the engine's per-session random key (crypto/rand at construction): pools re-roll on every fresh build while staying memo-stable within one session, so watch-mode rebuilds never reshuffle mid-session. A pinned `SeedKey` (the mock.seed lane below) makes the pool identical on every machine and build. Budget = count × retries (floored at one draw per sample). Wire structs + seed/budget/job builders live in the UNTAGGED `wire.go`, shared by the native subprocess transport and the WASM hook transport so they can never drift. Native memoizes per (op, pattern, knobs, seed).

**`mock.seed` is the reproducibility knob, read at build time (user amendment)**: a NEW lenient marker `CompTimeHints<T>` (identity alias like `CompTimeArgs`, syntactic detection, NO CTA enforcement — a dynamic options bag stays legal and simply invisible) brands `createMockDataFn`'s options parameter. The scanner (`extractMockSeedHint`, riding the same options reader as `strategy`/`numberMode`: `as const` unwrap, whole-const presets, source-order spreads, last-write-wins) reads a literal `{mock: {seed: N}}` and stamps it on the site (`protocol.Site.MockSeed`, `json:"-"` — resolver-internal). The enrichment pass maps every seeded mock site's demanded type graph (the recordFileIDs subtree walk) to a per-node seed basis: sorted distinct seeds mix via `SeedKeyFromStrings` into the pinned run key; nodes with no seeded demand stay on the random session key. A basis that changes mid-session (a seeded site scanned later) regenerates the pools WE wrote — declared samples are never touched. Since factory options also merge into every runtime call, ONE literal seed pins both the pool and the picks end to end.

**WASM hook — the playground IS the JS engine** (user amendment): `wasm.go` routes BOTH ops through the synchronous `__tsRunTypesJsEngine` host hook when installed (request-line JSON in, response-line JSON out — the exact stdio contract). The hook is the sidecar package's second vite build (`dist/sidecar-hook.js`, IIFE): `build-playground.mjs` stages it next to the wasm, `wasmLoader.ts` loads it before instantiating (best-effort), and the node playground tests run it via `vm.runInThisContext` (`nodeResolver.ts.installSidecarHook`). Without the hook: validation falls back to the host `RegExp`, generation degrades to FMT005 — never a crash. A throwing hook degrades the same way.

**Resolver enrichment pass** (`resolver/pattern_enrich.go`, called from `rtRenderOpts` + `scopedDump` — single-threaded, before the parallel collects, idempotent): walks `cache.NodesView()` annotations AND their nested sub-format param maps (a domain's `names`/`tld`, an email's `localPart` — the mock draws from those too), and for every params map carrying a `pattern.source` with no declared samples, writes `pattern.mockSamples` from `GeneratePattern` under the node's seed basis. The mutation is post-intern — the ONE documented exception to NodesView's read-only contract — so typeIDs never depend on knobs or seeds. Length hints derive via the shared `formats.PatternSampleLengthHints` (exact `length` pins both ends). Generation failures are RECORDED in `Session.patternGenFailures` (keyed `source\x00flags`) for the emitter.

**FMT005 at emit time**: `validateSamples` (formats/string/pattern.go) gained a tail — pattern compiles clean AND zero samples at emit ⇒ count 0 → "generation is disabled (patternSampleCount 0)", else surface the reason the enrichment pass recorded (threaded as `RenderOpts.PatternGenFailures` → walker → `EmitContext.PatternGenFailure(source, flags)`; no emit-time replay, so seeded/unseeded runs can never observe a diverging verdict). Emit-time placement gets the demanding call sites' provenance for free. `EmitContext` also carries `PatternSampleCount()` for the disabled message.

**TWO knobs on every surface** — `patternSampleCount` (default 100, `0` disables) and `patternSampleRetries` (default 10; per-sample draw multiplier — user amendment): `PluginOptions` + guarded spreads (`unplugin.ts`), `plugin-option-keys.ts`, `ResolverClientOptions` + `--pattern-sample-count` / `--pattern-sample-retries` (`resolver-client.ts`), `sharedFlags` IntVars carrying `constants.DefaultPatternSample*` (`main.go`, with post-merge validation), `tsRuntypesPlugin` `*int` keys (`config.go`, regenerated pluginkeys), `buildconfig.go` merges (flag > tsconfig > default), `resolver.Options`, and BOTH in `diskcache.FingerprintInputs` with the version tag bumped v9 → v10. The WASM twin (`cmd/ts-runtypes-wasm`) runs the binary defaults.

**JS surface relaxation**: `StringPatternArgs.mockSamples` optional (`FormatPattern.mockSamples` conditional accordingly); `registerFormatPattern` validates only declared samples. NEW: `StringPatternArgs.exec?: never` — with samples optional, a bare `RegExp` VALUE (which has `source` + `flags`) would otherwise fit structurally; the blocker keeps `TF.string({pattern: /x/})` rejected (its literals can never reach the scanner). `mockStringFormat` throw message now explains samples are auto-generated by the build and must be declared when building without the plugin. Built-in patterns keep their explicit samples (typeID stability + published `.d.ts` literals).

## Tests shipped

- **Sidecar unit** (`jobs.test.ts`): determinism, seed divergence, finite-language dedupe, bounds filter, lookbehind `generateError`, budget-exhausted message, compileError; `handleRequestLine` contract.
- **Go engine** (`sidecar_test.go` + `wire_test.go`): round-trip via the TestPattern oracle, SEEDED cross-process determinism (same SeedKey, two engines, identical pools) vs UNPINNED per-engine variance (two engines differ; one engine stays stable), memoization, unsupported-construct / budget / compile lanes, bounds, pinned FNV seed constants + `SeedKeyFromStrings` mixing + budget clamps + wire job + run-key resolution.
- **Go resolver** (`format_sample_validation_test.go`): `_GeneratedSamplesFillAnnotation` (count respected, values match, BOTH marker call shapes share one interned node — marker coverage rule; unseeded pools DIFFER across sessions and stay stable within one), `_SeededMockSitePoolsReproducible` (literal `{mock: {seed: 42}}` on both createMockDataFn shapes ⇒ identical pools across sessions; a different seed draws a different pool; the seed never touches the typeID), `_DeclaredSamplesUntouched`, `_GenerationDisabledFMT005`, `_UngeneratableFMT005` (lookbehind), `_TypeIDStableAcrossKnobs` (5 vs 50 vs 0 identical; declared-samples id distinct). Inline harness defaults now mirror the binary knobs; its marker stub declares `CompTimeHints` + `createMockDataFn`.
- **JS integration** (`test/features/generatedPatternSamples.test.ts`): sample-less pattern mocks matching values through BOTH `createMockDataFn` shapes, `getRunTypeId` convergence, validate(mock()) soundness, seeded-mock reproducibility (per call AND via a literal factory seed end to end), a dynamic options bag staying legal (the CompTimeHints no-enforcement pin), value-first `TF.string` sample-less.
- **Suite case** `pattern_generated` (`StringFormat.ts`) riding all 12 lanes with no samples declared anywhere.
- **WASM parity** (`test/playground/engine.test.ts`): a sample-less pattern mocks + validates through the REAL wasm module with the hook installed.
- **Devtools**: resolver-args flag cases (0 included), cli-surface snapshot, plugin-option parity; Go buildconfig merge + fingerprint isolation cases.
- **Fuzz** `patterngen` (`patternGenFuzz.test.ts`, FUZZ table entry): supported-subset round-trip + determinism oracles (same child, second child process), adversarial constructs with the values-always-sound contract.

## Docs shipped

Website: type-formats ::note (samples optional, generated fresh per build, a literal mock.seed pins them, declared win, bare regex still rejected), pure-functions registerFormatPattern paragraph, mocking seed section (the one-knob pool+pick story) + format-aware bullet, configuration table rows for both knobs. `packages/examples/src/guide/custom-format-pattern.ts` shows declared + samples-less registrations. `docs/ARCHITECTURE.md` sidecar paragraph covers the generate op, the run-key seeding model (random per build, mock.seed pins, CompTimeHints), post-intern injection, and the WASM hook. `docs/ROADMAP.md` value-first pattern parenthetical corrected.

## Out of scope (unchanged)

- Generating `mockSamples` for `disallowedChars` / `disallowedValues` (negative constraints stay required).
- Enrichment `MockData` pools.
- Touching the 13 built-in pattern registrations.
- User-facing mock RNG seeding (already shipped).

## Done when

- [x] A pattern with no `mockSamples` type-checks, builds, and mocks values matching the regex, covered by both marker call shapes.
- [x] Pools are RANDOM per build by default (stable within a session); a literal `{mock: {seed}}` on `createMockDataFn` (read through the lenient `CompTimeHints` marker) pins both the generated pool and the runtime picks across builds and machines; typeIDs provably unaffected by knobs and seeds alike.
- [x] `patternSampleCount` (default 100, `0` disables) and `patternSampleRetries` (default 10) flow flag > tsconfig > default on every surface, and both are in the disk-cache fingerprint.
- [x] The playground/WASM path generates via the `__tsRunTypesJsEngine` hook with native parity (node-side wasm test proves it); without the hook it degrades to FMT005, never a crash.
- [x] Ungeneratable patterns fail with FMT005 telling the user to declare samples (the reason recorded by the enrichment pass, no emit-time replay); declared samples behave exactly as before; dynamic options bags stay legal.
- [x] `pnpm test`, `go -C ts-go-runtypes test ./internal/...`, the `patterngen` fuzz suite, lint, and format green; website/examples/ARCHITECTURE/ROADMAP updated.
