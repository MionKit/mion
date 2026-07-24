# Transform architecture — CLI full-transform + incremental wire

**Status:** **implemented** (2026-07-04). The **wire** half shipped in [transform-wire-modes](../done/transform-wire-modes.md); the **CLI** half (`ts-runtypes --compile`) is now built — see What shipped.
**Related:** [`internal/compiler/batchcompile/compile.go`](../../internal/compiler/batchcompile/compile.go) (the pipeline), [`internal/compiler/sourcerewrite/compose.go`](../../internal/compiler/sourcerewrite/compose.go) (`ComposeMaps`), [`internal/compiler/sourcerewrite/transform.go`](../../internal/compiler/sourcerewrite/transform.go) (`Apply`), [`internal/compiler/resolver/dispatch.go`](../../internal/compiler/resolver/dispatch.go) (`OpTransform`, `OpGenerate`), [`cmd/ts-runtypes/main.go`](../../cmd/ts-runtypes/main.go) (`--compile`)

## What shipped

`ts-runtypes --compile` — a tsc-style batch compile ([internal/compiler/batchcompile.Run](../../internal/compiler/batchcompile/compile.go)):

1. **Pass 1** builds the tsconfig Program, scans for markers, and via `OpTransform` (empty OutDir → keeps `virtual:rt/…` specifiers) gets each marker file's rewritten source + **map A** (rewritten → original); `OpGenerate` writes the cache modules to the compile cache dir — resolved tsc-style: the `--gen-dir` flag, then the tsconfig `genDir` plugin key, then the `<cwd>/__runtypes` default (`resolveGenDir` in `buildconfig.go`).
2. **Pass 2** rebuilds the Program with the rewritten sources **overlaid** at the same paths (so the real tsconfig options — target/module/outDir/sourceMap — apply) and runs tsgo `Emit`, capturing every output via the `WriteFile` sink.
3. Each emitted `.js` has its `virtual:rt/…` imports relativized to the cache dir **against its output location**; each emitted `.js.map` (**map B**: js → rewritten) is composed with map A into **map C** (js → original) so breakpoints land on the user's source. Composition is `ComposeMaps` ([compose.go](../../internal/compiler/sourcerewrite/compose.go)) — Emit has no custom-transformer hook, so it is done here; it adds a v3 VLQ decoder mirroring the `EditBuffer`'s encoder.

Tests: `ComposeMaps` unit tests (round-trip + compose + injected-drop), a real temp-project Go integration test (asserts the composed map references only original lines), and a JS e2e that spawns the binary and proves the generated cache materializes a **working validator** at runtime.

## Known limitations / follow-ups

- **External source maps only.** `sourceMap: true` (external `.js.map`) is composed; `inlineSourceMap` (a data-URI map inside the `.js`) is NOT yet composed — extract + compose + re-inline is a follow-up. No source map (`sourceMap` unset) just emits `.js`.
- **ESM output.** Relativization matches `from '…'` specifiers; CommonJS emit (`require('virtual:rt/…')`) is not handled. Use `module: esnext`/`nodenext`.
- **Cache dir reachability.** The emitted `.js` import the cache modules by relative path, so the cache dir must be reachable from the output tree (default `<cwd>/__runtypes` works when the tsconfig `outDir` is under `<cwd>`); exotic `rootDir`/`outDir` layouts may need an explicit `--gen-dir`.
- `.d.ts` declaration emit passes through unmodified (call-site rewrites don't touch declarations).

## Two surfaces, two jobs

1. **CLI full transform — the `tsc`-style compile command (to build).**
   Reads real files off disk and emits, like `tsc`: the transformed `.js` (call-site rewrites + import injection applied), a source map honoring the project's tsconfig source-map options (`sourceMap` / `inlineSourceMap` / `sourceRoot`), and the generated cache modules under `<outDir>/types/`. One command that behaves exactly like a compile pass: no bundler, no IPC. Uses the Go `transform.Apply` (full rewrite + full-fidelity map) + `OpGenerate` internally. This is the universal / plugin-free / non-JS-host path, and the home of full-fidelity source maps.

2. **Incremental wire — the bundler plugin path (shipped).**
   The plugin's `transform` hook. Go returns the current `OpTransform` (edits-mode) response: the call sites, the deduped import block, the char-edits (span + text, at **UTF-16** offsets), and the source hash. The FE applies the edits to the bundler-supplied source and builds the source map itself. Minimal wire (O(sites), not O(file)), robust on long/minified lines because it ships deltas, not whole lines.

The two maps do **not** have to match each other — they feed different outputs (the CLI's emitted files vs the bundler's composite-map chain), so there is no Go↔FE map-parity contract to maintain. Each only has to be correct for its own consumer.

## Wire = char-edits, not whole lines (settled)

The wire carries modifications as char-span edits:
- A multi-line pure-fn factory replacement is a single char span → single binding; the FE applies it as a span (the lines collapse). No line-range wire format is needed, and the collapse is the map builder's concern, not the code applier's.
- A long / minified line ships ~15 B per edit, not the whole (potentially huge) line.

Whole-line ("modified lines") encoding was **rejected**: it degrades to full-file wire *and* a useless single-segment map exactly on long-line / minified input — the one case that actually needs column information. Char-deltas are the minified-safe minimal encoding, and the client can bucket them by line whenever it wants line-level structure (e.g. for a cheaper map).

## Byte offsets vs UTF-16 code units — required, and already Go-side

Source-map columns and JS string indexing are **UTF-16 code units**; tsgo positions are **UTF-8 byte offsets**. The conversion (`makeByteToChar`) is REQUIRED whenever the user's SOURCE contains any non-ASCII character (a Unicode identifier, an em-dash in a comment, an emoji in a string). It is a property of the ORIGINAL SOURCE, **not** of the injected code: the injected bindings / import block being pure ASCII does not let us skip it, because one multibyte char before a call site shifts every downstream byte offset off from its UTF-16 index.

This conversion happens in **Go, before the wire**: `ComputeEdits` runs `makeByteToChar`, so every `Edit` offset shipped is already a UTF-16 code unit. The FE therefore needs **no** byte↔UTF-16 library — it indexes the JS string (already UTF-16) with the offsets directly and builds UTF-16 map columns natively. Astral chars (emoji = surrogate pair = 2 code units) are handled by `utf16Len`; pinned by the multibyte fixtures. Keeping the conversion Go-side is a property to preserve — it was a motivation for owning the transform in Go, and the char-edits wire keeps that benefit intact.

## Source-map fidelity note

The wire map ships in production `vite build` too (the transform hook runs in build, not only dev), so its granularity is the production source-map granularity. Today it is full boundary-granular (byte-identical to what `go` mode produced). A cheaper line / per-edit map is deferred — see [edits-coarse-map-resolution](./edits-coarse-map-resolution.md). Line-count-preserving tricks (comment-out or newline-pad the replaced function so `generated line == original line + importLines` holds globally) were evaluated and **rejected**: no substantial benefit, and comment-out has the nested `*/` hazard. Pure-fn line collapses stay handled directly by the map builder's line-delta tracking, not by preserving line count.

## Build items (next)

1. **`ts-runtypes` compile CLI** — the tsc-like command above: read files → emit transformed `.js` + source map (tsconfig options passthrough) + generated caches to disk. Reuses `Apply` + `OpGenerate`; optional `--watch`.
2. **(optional) retire `go` as a plugin wire mode** once the CLI covers the non-bundler / non-JS-host case — or keep `go` as the plugin's applier-throw fallback. Judgment call; the plugin wire default is already `edits`.
3. **(deferred) line / per-edit map optimization** — [edits-coarse-map-resolution](./edits-coarse-map-resolution.md), only if the FE map-gen cost ever matters in practice (the transform-wire benchmark says it does not dominate concurrent builds).
