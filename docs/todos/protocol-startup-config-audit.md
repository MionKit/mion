---
type: chore
spec: full-plan
status: ready
created: 2026-07-25
---

# Protocol startup-config audit — move session-constant config off the wire

## Problem

`protocol.Request` mixes two kinds of fields: genuine per-invocation **events** (which op, which
files, which sources) and session-constant **config** that every production caller echoes verbatim
on every call. The worst offender is `outDir`: the plugin adopts one `genDirAbs` at buildStart
(`unplugin.ts` infer-then-adopt via the generate echo) and then re-sends that same string on every
transform/generate for the life of the session. `omitSourcesContent` likewise just mirrors the
immutable plugin option `sourcesContent`.

The principle, established by the OpEnrich slim-down on the `enrich-surface-and-plugin-sync`
branch (the precedent this todo extends): **the wire carries events; the session carries config**,
loaded once at spawn as flags on the `serve` command and landing in `resolver.Options`. Spawn
flags are respawn-safe for free (the client replays the same argv), and the binary + plugin
version in lockstep (exact-pinned, published together), so wire changes carry no compat burden.

## Verdict table (all Request fields; anchors verified at audit time)

| Field | Verdict | Rationale |
| --- | --- | --- |
| `op`, `files`, `sources` | stay | The events themselves. Fix doc drift while here: the `files` comment says "scanFiles only" (transform + enrich read it too); the Go `outDir` comment says "ignored by other ops" (false — transform reads it at `dispatch.go:1064,1078`). |
| `id` + `OpResolveId` | **delete** | Dead surface: no JS client method exists (`resolver-client.ts` has no `resolveId()`), the op string sits unused in the TS union, and the sole consumer is `resolveid_test.go`. Remove the op const, the dispatch case (`dispatch.go:988-993`), `Session.ResolveID` (`dispatch.go:1118-1126`), the Request field, and the test; check whether `cache.NodeByID` loses its last caller (delete or fix its comment); update the wasm doc comment (`cmd/ts-runtypes-wasm/main.go:13`). |
| `includeRunTypes`, `includeEntryModules` | stay | Response-payload selectors scoped to THIS request's files — inherently per-event. Live consumers: the website playground (`engine.ts:166`), `scripts/core/smoke.mjs:83`, the suite-data exporters, `test/helpers/inline.ts:268` (the shared vitest worker mixes them per request), and ~27 Go test files. |
| `includeMetrics` | stay | Same payload-selector shape ("instrument THIS op"); zero cost when unset. Live consumer `render_parallel_test.go:99`, and it is the documented bench instrumentation hook (`docs/done/transform-wire-modes.md`). An earlier sweep called it dead — it is not. |
| `checkEnrich`, `includeRtDiagnostics` | stay (deliberate exception) | Lane selectors for the one-pass lint scan. The lint worker owns its own session (`eslint/lint-worker.ts:78`), so spawn flags WOULD be possible — but (a) CLAUDE.md documents the lint plugin as "pure transport over the resolver's checkEnrich + includeRtDiagnostics scan flags", (b) `includeRtDiagnostics` is implied by `includeEntryModules` (`dispatch.go:809`), so a spawn variant would split one walker mode across two triggers, and (c) the cost is ~45 bytes on a lane that ships whole file texts. Recorded here so the next audit does not re-litigate. |
| `emitEdits` | stay | A real per-request lane: `transformViaEdits` degrades to go-mode WITHIN one session on source-hash drift or applier throw (`unplugin.ts` fallback), and the mode-parity tests run both modes on one client. `protocol.go` already pins it: "a per-request knob … must never fold into any disk-cache fingerprint". |
| `outDir` | **→ spawn** (the big one) | Session-constant adopted `genDirAbs` in every wire consumer. Design below (`Options.GenDir` + `Options.TransformRelative`). |
| `omitSourcesContent` | **→ spawn** | Pure mirror of the immutable plugin option `sourcesContent` (`unplugin.ts` derives it once). New `--omit-sources-content` flag; the transform-wire bench already spawns a client per mode, so its per-request arg just moves to construction. |
| `typeName`, `enrichUpdate`, `enrichNoEmit`, `genDir`, `enrichFriendly`/`enrichMock`, `enrichLocales`/`enrichSourceLocale` | done (precedent) | Deleted / moved to spawn flags by the OpEnrich slim-down this todo extends. |

## Plan (phased; each phase leaves the tree green)

- **Phase 0 — precondition.** The OpEnrich slim-down is landed (same seams: `resolver.Options`,
  serve flags, `buildResolverArgs`, the unplugin spawn-option spread). Adopt its flag naming.
- **Phase 1 — OutDir → session.**
  - `resolver.Options` gains `TransformRelative bool` (OpTransform injects imports relative to the
    resolved output root; false = virtual `rtmod:/` specifiers). `GenDir` exists from Phase 0.
  - `resolveOutDir` (`generate.go:290-302`) drops its request parameter: precedence
    `Options.GenDir` > `TsconfigGenDir` > inferred `<srcDir>/__runtypes`.
  - `dispatch.go`: OpGenerate uses `sess.resolveOutDir()`; **keep the `Response.OutDir` echo**
    (see D2), rewording its doc ("the session-resolved root"). OpTransform replaces the
    `request.OutDir != ""` gates (`:1064`, `:1078`) with `sess.opts.TransformRelative` and the
    per-file `sess.absPath(request.OutDir)` with one up-front `sess.resolveOutDir()`.
  - `main.go`: move `--gen-dir` from compile-only (`:524`) into `registerSharedFlags`, add
    `--transform-relative`; when splitting `resolveGenDir` (`buildconfig.go:170-185`), keep
    compile's `<cwd>/__runtypes` default OUT of serve (serve's empty value must keep meaning
    "infer from srcDir", which is a different root).
  - `batchcompile/compile.go`: set `opts.GenDir` before `resolver.New`, drop `OutDir:` from the
    generate request (`:129`); `TransformRelative` stays false so the pass-1 transform keeps
    virtual specifiers (update the `:111-112` comment).
  - Delete `Request.OutDir` (`protocol.go:426-429`) and rewrite the Request doc block as a wire
    taxonomy (events / payload selectors / lane selectors; config lives in `resolver.Options`).
- **Phase 2 — OmitSourcesContent → session.** Options field + `--omit-sources-content`;
  `dispatch.go:1087` reads opts; delete `protocol.go:451-457`. Doc the field as a wire trim,
  NOT a disk-fingerprint input (transforms are never disk-cached).
- **Phase 3 — dead surface.** Delete `OpResolveID`, `Request.ID`, the dispatch case,
  `Session.ResolveID`, `resolveid_test.go`; handle `cache.NodeByID`; fix the wasm comment.
- **Phase 4 — JS.** `protocol.ts` drops `id`/`outDir`/`omitSourcesContent` + `'resolveId'` from
  the op union and fixes the `files` comment. `resolver-client.ts`: `transform(files, opts?)`
  (outDir param gone), `generate()` (no arg; the `GenerateResult.outDir` echo stays),
  `TransformOptions` keeps only `emitEdits`; `ResolverClientOptions` + `buildResolverArgs` gain
  `genDir` / `transformRelative` / `omitSourcesContent` with the guarded only-when-set idiom.
  `unplugin.ts`: the spawn spread passes `genDir` (when the option is set),
  `transformRelative: true` (the plugin lane always relativizes), and `omitSourcesContent` from
  `sourcesContent === false`; every per-call `genDirAbs` argument disappears; keep the
  generate-echo adoption and `isUnderEnrichedDir`.
- **Phase 5 — tests, snapshots, docs.**
  - Go: `generate_test.go` (11 sites — multi-dir sequences become one-session-per-dir, which is
    production-faithful now that a session's dir is spawn-pinned), `pure_fn_report_test.go`
    (5 sites), a `resolveOutDir` precedence case in `generate_internal_test.go`.
  - JS: `transform-modes.test.ts` trim block becomes a two-client A/B (one-shot client with
    `omitSourcesContent: true` vs the shared worker client — the one-shot pattern already exists
    in `helpers/inline.ts`); `resolver-args.test.ts` cases for the three new flags; cli-surface
    `-u` (serve/compile help goldens).
  - Docs: ARCHITECTURE.md ops count/table + resolveId row + the `Request.OmitSourcesContent`
    mention; ROADMAP.md ops row; the protocol taxonomy comments both sides; a transform-wire
    bench re-baseline note.

## Decisions

- **D1 — `TransformRelative` is a session knob.** Every consumer is session-homogeneous (the
  plugin always relativizes; batchcompile pass-1 / bench / the inline test lane always want
  virtual). It cannot be inferred from `GenDir` resolving non-empty (inference makes that always
  true) nor from "the session ran OpGenerate" (batchcompile generates AND virtual-transforms in
  the same session — `compile.go:111-129`). Fallback if this proves wrong in implementation:
  keep a transform-only optional `outDir` on the wire and migrate only generate.
- **D2 — keep the `Response.OutDir` echo.** The dependency-free plugin cannot compute the
  inferred `<srcDir>/__runtypes` and still needs it JS-side (enriched-dir HMR suppression);
  batchcompile adopts it too. It joins `FailOnError` as the sanctioned resolved-config
  server→client echo channel.
- **D3 — lint-lane flags stay on the wire** (see table).
- **D4 — bench re-baseline.** transform-wire wire sizes shrink (no outDir/omitSourcesContent
  bytes); note it next to the published numbers.
- **D5 — keep `TsconfigGenDir` separate from `GenDir`.** Merging is tempting but is a follow-up
  after this and the enrich work both settle; watch that compile's `<cwd>` default never leaks
  into serve's srcDir inference.
- **D6 — respawn safety holds.** Spawn flags replay via `spawnChild → buildResolverArgs`; the
  known setSources-overlay non-replay is untouched.

## Out of scope

- Replaying the `setSources` overlay across respawns (separate, pre-existing).
- Merging `TsconfigGenDir` into `GenDir` (D5 follow-up).
- Migrating `checkEnrich`/`includeRtDiagnostics` (D3: deliberate exception).
- Response-side changes beyond rewording the `OutDir` echo doc.

## Done when

`protocol.Request` is exactly: `op` + `files` + `sources` (events), `includeRunTypes` /
`includeEntryModules` / `includeMetrics` (payload selectors), `checkEnrich` /
`includeRtDiagnostics` / `emitEdits` (lane selectors). `resolveId` is gone. Full Go
(`go -C ts-go-runtypes test ./internal/...`) + JS (`pnpm test`) gates green, cli-surface goldens
regenerated, docs/comments match the new taxonomy. (~600 changed lines; 2-3 focused sessions.)
