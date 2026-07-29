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

**Go engine op** (`internal/jsengine`): `Engine.GeneratePattern(source, flags, count, retries, minLength, maxLength)` → `GenerateResult{CompileError, GenerateError, Values}`. The seed is FNV-1a/32 over `source\x00flags\x00count` — content-derived, so output is identical across machines and rebuilds (pinned constant in `wire_test.go`). Budget = count × retries (floored at one draw per sample). Wire structs + seed/budget/job builders live in the UNTAGGED `wire.go`, shared by the native subprocess transport and the WASM hook transport so they can never drift. Native memoizes per (op, pattern, knobs) in the existing engine memo.

**WASM hook — the playground IS the JS engine** (user amendment): `wasm.go` routes BOTH ops through the synchronous `__tsRunTypesJsEngine` host hook when installed (request-line JSON in, response-line JSON out — the exact stdio contract). The hook is the sidecar package's second vite build (`dist/sidecar-hook.js`, IIFE): `build-playground.mjs` stages it next to the wasm, `wasmLoader.ts` loads it before instantiating (best-effort), and the node playground tests run it via `vm.runInThisContext` (`nodeResolver.ts.installSidecarHook`). Without the hook: validation falls back to the host `RegExp`, generation degrades to FMT005 — never a crash. A throwing hook degrades the same way.

**Resolver enrichment pass** (`resolver/pattern_enrich.go`, called from `rtRenderOpts` + `scopedDump` — single-threaded, before the parallel collects, idempotent): walks `cache.NodesView()` annotations AND their nested sub-format param maps (a domain's `names`/`tld`, an email's `localPart` — the mock draws from those too), and for every params map carrying a `pattern.source` with no declared samples, writes `pattern.mockSamples` from `GeneratePattern`. The mutation is post-intern — the ONE documented exception to NodesView's read-only contract — so typeIDs never depend on the knobs. Length hints derive via the shared `formats.PatternSampleLengthHints` (exact `length` pins both ends), the same helper the FMT005 replay uses so the two calls share a memo key and can never observe different outcomes.

**FMT005 at emit time**: `validateSamples` (formats/string/pattern.go) gained a tail — pattern compiles clean AND zero samples at emit ⇒ count 0 → "generation is disabled (patternSampleCount 0)", else replay the memoized `GeneratePattern` and surface its `GenerateError`. Emit-time placement gets the demanding call sites' provenance for free. `EmitContext` gained `PatternSampleCount()` / `PatternSampleRetries()` (registry → emitter → walker → RenderOpts → rtRenderOpts forwarding, the `JSEngine()` clone).

**TWO knobs on every surface** — `patternSampleCount` (default 100, `0` disables) and `patternSampleRetries` (default 10; per-sample draw multiplier — user amendment): `PluginOptions` + guarded spreads (`unplugin.ts`), `plugin-option-keys.ts`, `ResolverClientOptions` + `--pattern-sample-count` / `--pattern-sample-retries` (`resolver-client.ts`), `sharedFlags` IntVars carrying `constants.DefaultPatternSample*` (`main.go`, with post-merge validation), `tsRuntypesPlugin` `*int` keys (`config.go`, regenerated pluginkeys), `buildconfig.go` merges (flag > tsconfig > default), `resolver.Options`, and BOTH in `diskcache.FingerprintInputs` with the version tag bumped v9 → v10. The WASM twin (`cmd/ts-runtypes-wasm`) runs the binary defaults.

**JS surface relaxation**: `StringPatternArgs.mockSamples` optional (`FormatPattern.mockSamples` conditional accordingly); `registerFormatPattern` validates only declared samples. NEW: `StringPatternArgs.exec?: never` — with samples optional, a bare `RegExp` VALUE (which has `source` + `flags`) would otherwise fit structurally; the blocker keeps `TF.string({pattern: /x/})` rejected (its literals can never reach the scanner). `mockStringFormat` throw message now explains samples are auto-generated by the build and must be declared when building without the plugin. Built-in patterns keep their explicit samples (typeID stability + published `.d.ts` literals).

## Tests shipped

- **Sidecar unit** (`jobs.test.ts`): determinism, seed divergence, finite-language dedupe, bounds filter, lookbehind `generateError`, budget-exhausted message, compileError; `handleRequestLine` contract.
- **Go engine** (`sidecar_test.go` + `wire_test.go`): round-trip via the TestPattern oracle, cross-process determinism, memoization, unsupported-construct / budget / compile lanes, bounds, pinned FNV seed + budget clamps + wire job.
- **Go resolver** (`format_sample_validation_test.go`): `_GeneratedSamplesFillAnnotation` (count respected, values match, cross-session determinism, BOTH marker call shapes share one interned node — marker coverage rule), `_DeclaredSamplesUntouched`, `_GenerationDisabledFMT005`, `_UngeneratableFMT005` (lookbehind), `_TypeIDStableAcrossKnobs` (5 vs 50 vs 0 identical; declared-samples id distinct). Inline harness defaults now mirror the binary knobs.
- **JS integration** (`test/features/generatedPatternSamples.test.ts`): sample-less pattern mocks matching values through BOTH `createMockDataFn` shapes, `getRunTypeId` convergence, validate(mock()) soundness, seeded-mock reproducibility, value-first `TF.string` sample-less.
- **Suite case** `pattern_generated` (`StringFormat.ts`) riding all 12 lanes with no samples declared anywhere.
- **WASM parity** (`test/playground/engine.test.ts`): a sample-less pattern mocks + validates through the REAL wasm module with the hook installed.
- **Devtools**: resolver-args flag cases (0 included), cli-surface snapshot, plugin-option parity; Go buildconfig merge + fingerprint isolation cases.
- **Fuzz** `patterngen` (`patternGenFuzz.test.ts`, FUZZ table entry): supported-subset round-trip + determinism oracles (same child, second child process), adversarial constructs with the values-always-sound contract.

## Docs shipped

Website: type-formats ::note (samples optional, generated, declared win, bare regex still rejected), pure-functions registerFormatPattern paragraph, mocking format-aware bullet, configuration table rows for both knobs. `packages/examples/src/guide/custom-format-pattern.ts` shows declared + samples-less registrations. `docs/ARCHITECTURE.md` sidecar paragraph covers the generate op, determinism, post-intern injection, and the WASM hook. `docs/ROADMAP.md` value-first pattern parenthetical corrected.

## Out of scope (unchanged)

- Generating `mockSamples` for `disallowedChars` / `disallowedValues` (negative constraints stay required).
- Enrichment `MockData` pools.
- Touching the 13 built-in pattern registrations.
- User-facing mock RNG seeding (already shipped).

## Done when

- [x] A pattern with no `mockSamples` type-checks, builds, and mocks values matching the regex, covered by both marker call shapes.
- [x] Generated output is deterministic across rebuilds; typeIDs provably unaffected by the knobs.
- [x] `patternSampleCount` (default 100, `0` disables) and `patternSampleRetries` (default 10) flow flag > tsconfig > default on every surface, and both are in the disk-cache fingerprint.
- [x] The playground/WASM path generates via the `__tsRunTypesJsEngine` hook with native parity (node-side wasm test proves it); without the hook it degrades to FMT005, never a crash.
- [x] Ungeneratable patterns fail with FMT005 telling the user to declare samples; declared samples behave exactly as before.
- [x] `pnpm test`, `go -C ts-go-runtypes test ./internal/...`, the `patterngen` fuzz suite, lint, and format green; website/examples/ARCHITECTURE/ROADMAP updated.
