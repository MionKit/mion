---
type: feature
spec: full-plan
status: ready
created: 2026-07-29
---

# Pattern sample validation everywhere: a host JS engine driven by the Go resolver

## Problem

`mockSamples` for regex patterns are validated in three places today, and the union still leaves a hole:

1. **Module load (runtime JS)** — `registerFormatPattern` tests every sample with a real `RegExp` and throws (`packages/ts-runtypes/src/runtypes/formatPattern.ts:66-74`). Runtime-only; never sees inline `{source, flags, mockSamples}` params.
2. **Build lane (Go, RE2)** — the real validator: `validateSamples` → FMT001 and `validateSampleBounds` → FMT003 in `ts-go-runtypes/internal/cachegen/typefunctions/formats/string/pattern.go:119-179`, running wherever format emitters render — both `serve` and the tsc-like `compile` verb (`internal/compiler/batchcompile/compile.go:93,129` → `collectEntryModules`). RE2 semantics are bridged by `re2Pattern` (`pattern.go:365-381`), and `pattern.go:123` is the only `regexp.Compile` over user input in the tree.
3. **Lint lane (JS fallback)** — patterns RE2 cannot compile (lookarounds, backreferences) are recorded via `reportUncheckedPattern` (`pattern.go:355-363`) and shipped over a dedicated wire channel (`protocol.go:706-720` `UncheckedPattern`, `Response.UncheckedPatterns` `:626-630`) to `validateUncheckedPatterns` in `packages/ts-runtypes-devtools/src/eslint/lint-worker.ts:110-138`, which runs the real JS `RegExp` and reports FMT001 through the `runtypes/format` rule.

**The gap:** for a JS-only pattern, the build lane either fails closed with FMT004 or — with `allowUncheckedPatterns` — **silently skips the check** (`pattern.go:359-361`). The standalone `compile` verb has no lint lane at all, so on that path such samples are never validated by anything (pinned by `internal/compiler/resolver/format_sample_validation_test.go:212-240`). The devtools build lane itself validates nothing (zero `uncheckedPatterns`/FMT references in `unplugin.ts` / `vite.ts` / `scan-batcher.ts`).

Since a JS runtime is present on effectively every host that runs the binary (the plugin itself runs inside node; standalone users installed via npm), the Go resolver can drive one directly and validate everything itself — making `compile` fully sound and deleting the lint-lane fallback plus its wire channel.

## Design

**New package `ts-go-runtypes/internal/jsengine`** — a small engine the resolver calls to execute JS regex jobs:

```go
type Engine interface {
    // One batch per call; implementations must be safe to call from a render pass.
    Run(jobs []Job) ([]Result, error)
}
type Job struct{ ID int; Op string /* "validate" */; Source, Flags string; Samples []string }
type Result struct{ ID int; OK bool; Offenders []string; Err string }
```

- **Native impl (`//go:build !js`)** — materializes the embedded sidecar to a temp file (`os.CreateTemp`, content-hash-named for reuse, best-effort cleanup) and spawns `<runtime> <file>`, JSON over stdin/stdout, one process per batch, hard timeout. There is no production `os/exec` in the tree today (only two test self-re-execs in `cmd/ts-runtypes/*_test.go`), so this is new, deliberately minimal machinery.
- **WASM impl (`//go:build js && wasm`)** — no subprocess: the host IS a JS engine. Validate via `js.Global().Get("RegExp").New(source, flags)` + `.Call("test", sample)` directly (same synchronous host-call shape as `cmd/ts-runtypes-wasm/main.go:100-102`). No sidecar, no randexp needed for validation.
- **Injection** — `resolver.Options` gains `JSEngine jsengine.Engine`; `cmd/ts-runtypes/main.go` constructs the native impl, `cmd/ts-runtypes-wasm/main.go` the wasm impl, tests inject fakes.

**The sidecar is bundled, then embedded** (the user-confirmed direction). It is NOT template text like the existing JS-in-Go (`internal/cachegen/builtinpurefns/table.generated.go`); it is an executable program that must `import` npm packages. Resolution:

- Source lives in-tree at `ts-go-runtypes/internal/jsengine/sidecar/sidecar.mjs`, written as a normal ESM module (imports allowed).
- A new codegen lane bundles it into ONE self-contained ESM file (no imports survive to runtime) and emits `internal/jsengine/sidecar.generated.go` (a Go string constant + a version/hash constant). Bundler: **vite 8 in library mode** — already the root devDependency, no new build tooling. Generator script `scripts/core/gen-sidecar-js.mjs` (same committed-output + drift-gate convention as `scripts/core/gen-diagnostics-catalog.mjs`); wire a `sidecar` entry into the `CODEGEN` table in `scripts/rt.mjs` (usage line `scripts/rt.mjs:307`, drift gate `:124`, CI already runs `pnpm rtx core codegen all --check`).
- **Rejected:** loose `.js` files in the `@ts-runtypes/binary-*` packages (they ship exactly `lib/<exe>` + manifest + LICENSE + README, `scripts/release/build-binaries.mjs:108-136`; loose files break the copied-binary and `RT_BIN` cases and churn build-binaries/repo-contracts). Also rejected: inverting the relationship so node pulls files from Go — under the standalone `compile` verb no node process exists yet, so Go must be the spawner; embedding + temp-file materialization already IS "Go carries the files and hands them to node".

**Runtime discovery** (precedence): `--js-runtime <path>` flag > `RT_JS_RUNTIME` env > PATH probe for `node`, then `bun`. The devtools plugin always passes `--js-runtime` = `options.jsRuntime ?? process.execPath` at spawn (the plugin runs inside node, so the serve lane always has a runtime for free). Per the wire taxonomy in `docs/todos/protocol-startup-config-audit.md` ("the wire carries events; the session carries config"), this is a spawn flag into `resolver.Options` — never a `protocol.Request` field. It is host-specific config (like `binary`/`cwd`, `unplugin.ts:16-23`), so **no tsconfig key**.

**Failure semantics:** spawn failure, timeout, or malformed output ⇒ treat as "no JS runtime available": FMT004 fires exactly as today, with its message updated to say "install node/bun or pass --js-runtime"; `allowUncheckedPatterns` keeps suppressing it. FMT004's meaning narrows to this one case. Diagnostics severity semantics are unchanged (`internal/diagnostics/catalog.go:19-32`; Error halts via `surfaceDiagnostics` + `failOnError`, `unplugin.ts:427,455,647-648`).

## Plan

1. **Sidecar + codegen.** `sidecar.mjs` (stdin JSON `{v, jobs:[{id, op:'validate', source, flags, samples}]}` → stdout `{v, results:[{id, ok, offenders, error}]}`; protocol carries `v` and op strings so todo #2 can add `generate` without reshaping). `gen-sidecar-js.mjs` + `CODEGEN.sidecar` lane + committed `sidecar.generated.go`.
2. **`internal/jsengine`** — interface, native impl (discovery, temp-file materialization, spawn, timeout, JSON codec), wasm impl, fake for tests. Unit tests run against the real node on the host (the repo's test environment always has one).
3. **Wire into validation.** In `pattern.go`, the RE2 path stays first (fast, no subprocess). On `regexp.Compile` failure, instead of `reportUncheckedPattern`, queue the pattern+samples; drain the queue once per render pass through `Options.JSEngine` (batch), then emit FMT001 for offenders through the normal diagnostics channel. FMT003 bounds checking is pure Go and applies to unchecked samples too. Engine unavailable ⇒ FMT004/`allowUncheckedPatterns` as narrowed above. `compile` gains full validation automatically (same render path); `enrich` stays off the validation path (no format emitters).
4. **Delete the JS fallback + wire channel.** `lint-worker.ts:110-138` + merge at `:157`; `protocol.go:706-720`, `:626-630`, MarshalJSON `:951-952`; `protocol.ts:549-554`, `:489-492`; `resolver-client.ts:275-277,404`; `dispatch.go:300-318` (`expandUncheckedPatterns`) + sink setup `:823-833`/`:262-286`/`:873`; `walker.go:199-212,421-432`; `typefunctions/module.go:74-88,513-514,677-684`; `emitter.go:518-531`; `registry.go:61-71` (`RecordUncheckedPattern` off `EmitContext`; keep `AllowUncheckedPatterns()`); `render.go:39-42`; `resolver.go:154-160`. The lint lane still surfaces FMT001 — it now arrives as a regular diagnostic on the scan (routing via `diagnosticRouting.ts:276` unchanged).
5. **Flags/config/env.** `--js-runtime` StringVar on `sharedFlags` (`main.go:139` `registerSharedFlags`, used by serve `:400` + compile `:580`); `resolver.Options.JSEngine` construction in both mains; devtools: `PluginOptions.jsRuntime?` (`unplugin.ts`) + `plugin-option-keys.ts` row + `ResolverClientOptions` + `buildResolverArgs` push (`resolver-client.ts:556` idiom) — note the plugin-option-parity test treats host-only options specially (like `binary`); `RT_JS_RUNTIME` row in `scripts/lib/env.mjs` REGISTRY (scope `dev`) + `.env.sample` mirror. Update FMT004 headline in `internal/diagnostics/messages.go` and regenerate (`pnpm rtx core codegen diag`).

## Tests

- **Go:** rework `format_sample_validation_test.go` FMT004 lanes with a fake engine — JS-only pattern (lookbehind) + bad sample ⇒ FMT001; all-valid ⇒ no diagnostic; engine unavailable ⇒ FMT004; `allowUncheckedPatterns` + unavailable ⇒ silent skip. Keep the suite's paired static/reflect `getRunTypeId` fixtures and hash-equivalence assert (marker coverage rule; exemplar `resolver/atomic_test.go:953`).
- **`internal/jsengine` unit tests:** discovery precedence (flag > env > PATH), real-node round trip, timeout, malformed stdout, temp-file reuse.
- **Compile-verb integration (the headline):** a fixture project with a lookbehind pattern + non-matching sample fails `compile` with FMT001 — the exact case that is unvalidatable today.
- **JS:** `packages/ts-runtypes-devtools/test/eslint/plugin.test.ts:100-113` (`UNCHECKED_PATTERN_TS`) — build lane now emits FMT001 directly instead of FMT004+lint-recheck; update expectations. `cli-surface` snapshot `-u` (new flag in help). `resolver-args.test.ts` case for `--js-runtime` always-passed default. Mode-parity (`transform-modes.test.ts`) untouched. Any new marker-API fixture keeps both `getRunTypeId` call shapes paired with a convergence assert.

## Docs

- Website: `2.guide/9.linting.md:26` (drop "re-checks samples the build could not verify" from the `runtypes/format` row), `1.introduction/4.configuration.md:150` (`allowUncheckedPatterns` narrowed meaning; new `jsRuntime` bundler-option row), `2.guide/2.type-formats.md` note that JS-only regex features now validate at build time.
- `docs/ARCHITECTURE.md`: the CLI-verbs section (`:79-90`) and a short "JS engine sidecar" paragraph in the execution model.
- Regenerated diagnostic catalog (FMT004 wording) → `diagnosticCatalog.generated.ts` + website `diagnostics-catalog.json`.

## Fuzzing

New suite `patternParity` (entry in the `FUZZ` table, `scripts/rt.mjs:56-67`): random RE2-compilable patterns + random samples ⇒ RE2 verdict and sidecar JS verdict must agree. This is a compare-two-implementations oracle that pins the `re2Pattern` flag-translation bridge (`pattern.go:365-381`) — drift between Go and JS regex semantics is exactly the class of bug this feature can now catch mechanically.

## Out of scope

- Sample **generation** from patterns — the separate `pattern-mocksamples-autogeneration` todo (builds on this engine).
- Enrichment MD003 (validating `MockData` pool values against field types — `internal/enrichment/validate.go:217-220` calls it out as needing the runtime validator). This engine opens that door; not this change.
- Removing the module-load validation in `registerFormatPattern` (stays as the runtime guard).

## Done when

- [ ] `compile` validates samples of JS-only patterns (integration test proves the previously-unvalidatable case fails with FMT001).
- [ ] No `uncheckedPatterns` on the wire; `lint-worker.ts` contains no `RegExp` validation; the lint lane still reports FMT001 via normal diagnostics.
- [ ] FMT004 fires only when a JS engine is genuinely unavailable; `allowUncheckedPatterns` still suppresses it.
- [ ] Sidecar is bundled + embedded via a drift-gated `codegen sidecar` lane; binary packages' contents unchanged.
- [ ] `--js-runtime` / `RT_JS_RUNTIME` / auto-detection precedence tested; env var registered in `env.mjs` + `.env.sample`.
- [ ] `pnpm test`, `go -C ts-go-runtypes test ./internal/...`, `pnpm rtx core codegen all --check`, and the new fuzz suite green; website/ARCHITECTURE docs updated.

Estimated size: ~900 changed lines (≈400 new engine/sidecar, ≈300 deletions, ≈200 tests/docs); 2-3 focused sessions. Land before the autogeneration todo.
