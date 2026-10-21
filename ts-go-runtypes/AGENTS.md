# ts-go-runtypes (the Go resolver)

Side-channel type resolver behind `RunTypes/*`. Read before touching anything under `ts-go-runtypes/`.

- Compiler-driven: reaches tsgo's checker via the `oxc-project/tsgolint` shim, answers call-site type queries.
- JS packages are the only public surface.
- Go ≥ 1.26 (enforced by [go.mod](go.mod)). Tests: `go -C ts-go-runtypes test ./internal/... ./cmd/...`.

## Test seam with JS

- Vite plugin tests spawn `mion-bin/mion` → MUST be built before `pnpm test` (root `pretest` does it).
  See [SETUP.md → Build](../SETUP.md#build). After a Go edit: rebuild it before re-running JS plugin tests.
- Go-only tests need no binary, but DO read built marker dist `packages/run-types/dist`.
- `pnpm run check:builds` covers both.

## ⚠️ Every Go walk is a visitor, and a test proves it reaches every node

Any walk over a `RunType` graph, checker type, tsgo syntax or our declaration kinds.
Pattern = TypeScript's own (its node builder + `.d.ts` emitter).

- One switch per walk, one arm per kind. Each kind → own fn, named TS-style:
  `transformTypeReference`, `expandClassDecl`.
- Never re-test the same kinds in helpers around it. Models: `typeExprCore` (convert/printtype.go),
  `visitTypeUse` (compiler/apitypes/outside.go).
- A mode = a flag checked inside an arm. Never a second dispatch before the switch, never a nil-field check.
  Model: `printFlags` (convert/print.go), TypeScript's `nodebuilder.Flags`.
- Always visit children + descendants: `RunType` → `reflection.WalkGraph` / `EachRefSlot`, syntax → `ForEachChild`.
- Never a hand-picked `range node.Children` for a whole-type question: [walk rule](internal/reflection/AGENTS.md).
- Coverage test per walk: loops every kind, fails on a kind with no row (its arm, refused, or only walked through).
  It also checks each row against the real code.
- Copy one: `TestPrinters_EveryKindHasAnArm` + `TestPrintersCoverRunType` (convert),
  `TestOutside_EveryTypeNodeKindHasARow` (apitypes), `TestNonDataAgreement_EveryKindHasARow` (typefunctions),
  `TestEachRefSlot_CoversEveryChildSlot` (reflection).
- Break one row on purpose, watch the test fail, then trust it.

## Directory map

- [cmd/](cmd/): resolver binary (`mion`), WASM twin (`mion-wasm`), `gen-*` / `extract-*` codegen commands:
  fn-hashes, diag-catalog, ts-constants, builtin-purefn ids, run-type-kind, type-formats, plugin-keys,
  sourcerewrite-fixtures, fn-bodies.
- [internal/](internal/): pipeline packages (below). Our only writable Go tree besides `cmd/`.
- `go build` outputs ignored ([.gitignore](.gitignore)): extensionless file at module root or in `cmd/<x>/` = binary.
- Run every command from source (`go run ./cmd/<x>`). A committed binary fails the `check:tree` sweep.
- ⚠️ [third_party/](third_party/): `oxc-project/tsgolint` submodule (nests `microsoft/typescript-go`). OFF-LIMITS.
  - Never edit anything under it, patches at `third_party/tsgolint/patches/` included.
  - `git submodule update` discards local edits. `.gitmodules` `ignore = dirty` hides them from `git status`.
  - Bumping the pinned revision = separate intentional commit on the submodule pointer.
  - Change seems required → STOP, surface it. [Patching tsgolint](../SETUP.md#patching-tsgolints-typescript-go).
- [compiler/](internal/compiler/): source transformers (program, marker, builders, comptimeargs, resolver,
  sourcerewrite, entrymodules, batchcompile).
- [cachegen/](internal/cachegen/): cache generation (runtype, typefunctions, purefunctions, purefnindex, purefnids,
  operations, diskcache, hashid).
- [enrichment/](internal/enrichment/): FriendlyText / MockData codegen (astcheck, cldr, mirror, enrichgen).
  `enrichgen` = shared plan/config/check leaf the CLI verb and daemon op both call → they never drift.
- [diagnostics/](internal/diagnostics/): diagnostic catalog + severity messages, shared by resolver and lint plugin.
- [reflection/](internal/reflection/): canonical RunType reflection model every stage shares
  (kinds, subkinds, families, schema checks, temporal registry, ref-slot walking).
- [protocol/](internal/protocol/): Go ⇄ JS wire envelope (ops, Request/Response, scan sites, Site demand).
- Auxiliary, small, no cross-package state: `constants`, `jsquote`, `testfixtures` (F1..F17 fixtures), `textpos`.

## Area rules

- Whole-type rules: [reflection/AGENTS.md](internal/reflection/AGENTS.md). Read before a rule over a whole type.
- ⚠️ Pure fn id = SHIPPED body hash: [purefunctions/AGENTS.md](internal/cachegen/purefunctions/AGENTS.md).
  Read before changing what an id is made of: ruled-out alternatives + counterexamples live there.
- Pure fns from installed packages: [purefnindex/AGENTS.md](internal/cachegen/purefnindex/AGENTS.md).
  Read before touching the `mion-pure-fns/` artifact lane.
- JSON decoder guards, format error keys: [typefunctions/AGENTS.md](internal/cachegen/typefunctions/AGENTS.md).
  Read before adding a decoder arm, format or format param.
- Diagnostic Levels: [diagnostics/AGENTS.md](internal/diagnostics/AGENTS.md). Read before picking a code's Level.
- Platform classes, `URL`, readonly: [typeid/AGENTS.md](internal/cachegen/runtype/typeid/AGENTS.md).
  Read before changing what counts as data or what enters a type id.
- Installed package types: [compiler/AGENTS.md](internal/compiler/AGENTS.md). Read before reusing shipped ids or code.
- New or changed diagnostic or emit arm → run [add-diagnostic](../.agents/skills/add-diagnostic/SKILL.md).

## Marker test coverage rule

Any test exercising the marker API: Go under [internal/](internal/) AND the JS plugin under
[packages/devtools/test/](../packages/devtools/test/).

- MUST cover both `getRunTypeId` call shapes: static `getRunTypeId<T>()` (caller supplies T, no value)
  AND reflection `getRunTypeId(value)` (T inferred from the value).
- Paired tests, not parameterized. Natural shape per intent: `getRunTypeId<string>()` vs
  `const s: string = 'hello'; getRunTypeId(s);`. Both resolve to the same cache entry for equivalent T.
- ≥1 paired test per suite asserts hash equivalence of the two forms
  (`TestAtomic_FormEquivalence` in [atomic_test.go](internal/compiler/resolver/atomic_test.go)).
