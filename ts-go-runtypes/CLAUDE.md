# ts-go-runtypes guidelines (the Go resolver)

The Go program is the side-channel type resolver behind the `@ts-runtypes/*` packages; the JS packages are the only public surface. Compiler-driven: it reaches into tsgo's checker via the `oxc-project/tsgolint` shim to answer call-site type queries. Go ≥ 1.26 (enforced by [go.mod](go.mod)); tests: `go -C ts-go-runtypes test ./internal/...`.

Test seam with the JS side: the Vite plugin's tests spawn the compiled `bin/ts-runtypes`, so the binary MUST be built before `pnpm test` (the root `pretest` covers it, see [SETUP.md → Build](../SETUP.md#build)). After modifying Go sources, rebuild `bin/ts-runtypes` before re-running JS plugin tests. Go-only tests exercise the packages directly and don't need the prebuilt binary — but they DO read the built marker dist (`packages/run-types/dist`); `pnpm run check:builds` covers both.

## Directory map

- [cmd/](cmd/) — the resolver binary (`mion`), its WASM twin (`ts-runtypes-wasm`), and the `gen-*` / `extract-*` codegen commands (fn-hashes, diag-catalog, ts-constants, builtin-purefns, run-type-kind, type-formats, plugin-keys, sourcerewrite-fixtures, fn-bodies).
- [internal/](internal/) — pipeline packages (below). Our only writable Go tree apart from `cmd/`.
- ⚠️ [third_party/](third_party/) — `oxc-project/tsgolint` submodule (which nests `microsoft/typescript-go`). **OFF-LIMITS — never edit anything under here, including the patches at `third_party/tsgolint/patches/`.** Local changes are discarded by `git submodule update`, and `.gitmodules` declares `ignore = dirty` so accidental edits are invisible to `git status`. Bumping the pinned revision is a separate intentional commit on the submodule pointer. If a change seems genuinely required, STOP and surface the case — the patch workflow is in [SETUP.md → Patching tsgolint](../SETUP.md#patching-tsgolints-typescript-go).

Working subpackages under `internal/`:

- [compiler/](internal/compiler/) — source transformers (program, marker, builders, comptimeargs, resolver, sourcerewrite, entrymodules, batchcompile).
- [cachegen/](internal/cachegen/) — cache generation (runtype, typefunctions, purefunctions, operations, diskcache, builtinpurefns, hashid).
- [enrichment/](internal/enrichment/) — FriendlyText / MockData codegen (astcheck, cldr, mirror, enrichgen — the shared plan/config/check leaf the CLI verb and the daemon op both call, so they can never drift).
- [diagnostics/](internal/diagnostics/) — diagnostic catalog + severity messages shared by resolver and lint plugin.
- [reflection/](internal/reflection/) — the canonical RunType reflection model every pipeline stage shares (kinds, subkinds, families, schema checks, temporal registry, ref-slot walking).
- [protocol/](internal/protocol/) — Go ⇄ JS wire envelope (ops, Request/Response, scan sites, Site demand).
- Auxiliary (kept small, no cross-package state): `constants`, `jsquote`, `testfixtures` (F1–F17 fixtures), `textpos`.

## ⚠️ Marker test coverage rule

Applies to any test exercising the marker API — Go under [internal/](internal/) AND the JS plugin under [packages/ts-runtypes-devtools/test/](../packages/ts-runtypes-devtools/test/):

- MUST cover both call shapes of `getRunTypeId`: static `getRunTypeId<T>()` (caller supplies T, no value) AND reflection `getRunTypeId(value)` (T inferred from the value).
- Write paired tests (not parameterized); use the natural call shape for each intent — e.g. `getRunTypeId<string>()` vs `const s: string = 'hello'; getRunTypeId(s);`. Both forms should resolve to the same cache entry for equivalent T.
- At least one paired test per suite must assert hash equivalence between the two forms (see `TestAtomic_FormEquivalence` in [internal/compiler/resolver/atomic_test.go](internal/compiler/resolver/atomic_test.go)).
