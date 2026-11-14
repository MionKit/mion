# ts-go-runtypes (the Go resolver)

Side-channel type resolver behind `RunTypes/*`. Read before touching anything under `ts-go-runtypes/`.

- Compiler-driven: reaches tsgo's checker via the `oxc-project/tsgolint` shim, answers call-site type queries.
- JS packages are the only public surface.
- Go ≥ 1.26 (enforced by [go.mod](go.mod)). Tests: `go -C ts-go-runtypes test ./pkg/... ./cmd/...`.

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
- Never a hand-picked `range node.Children` for a whole-type question: [walk rule](pkg/reflection/AGENTS.md).
- Coverage test per walk: loops every kind, fails on a kind with no row (its arm, refused, or only walked through).
  It also checks each row against the real code.
- Copy one: `TestPrinters_EveryKindHasAnArm` + `TestPrintersCoverRunType` (convert),
  `TestOutside_EveryTypeNodeKindHasARow` (apitypes), `TestNonDataAgreement_EveryKindHasARow` (typefunctions),
  `TestEachRefSlot_CoversEveryChildSlot` (reflection).
- Break one row on purpose, watch the test fail, then trust it.

## Directory map

- [cmd/](cmd/): resolver binary (`mion`, a few lines over [pkg/cli](pkg/cli/)), WASM twin (`mion-wasm`),
  `gen-*` / `extract-*` codegen commands (shared helpers: [pkg/codegen](pkg/codegen/)):
  fn-hashes, diag-catalog, ts-constants, builtin-purefn ids, run-type-kind, type-formats, plugin-keys,
  sourcerewrite-fixtures, fn-bodies.
- [pkg/](pkg/): pipeline packages (below). Our only writable Go tree besides `cmd/`. Importable by another module,
  with no stability promise across mion versions: a binary built on mion pins a tag.
- `go build` outputs ignored ([.gitignore](.gitignore)): extensionless file at module root or in `cmd/<x>/` = binary.
  Run every command from source (`go run ./cmd/<x>`). A committed binary fails the `check:tree` sweep.
- ⚠️ [third_party/](third_party/): `oxc-project/tsgolint` submodule (nests `microsoft/typescript-go`). OFF-LIMITS.
  - Never edit anything under it, patches at `third_party/tsgolint/patches/` included.
  - `git submodule update` discards local edits. `.gitmodules` `ignore = dirty` hides them from `git status`.
  - Bumping the pinned revision = separate intentional commit on the submodule pointer.
  - Change seems required → STOP, surface it. [Patching tsgolint](../SETUP.md#patching-tsgolints-typescript-go).
- [compiler/](pkg/compiler/): source transformers (program, marker, builders, comptimeargs, resolver,
  sourcerewrite, entrymodules, batchcompile).
- [cachegen/](pkg/cachegen/): cache generation (runtype, typefunctions, purefunctions, purefnindex, purefnids,
  operations, diskcache, hashid).
- [cli/](pkg/cli/): the `mion` command line (verbs, flags, the tsconfig plugin reader), `cli.Main`.
- [diagnostics/](pkg/diagnostics/): diagnostic catalog, one row per code with its text, shared by resolver and lint.
- [reflection/](pkg/reflection/): canonical RunType reflection model every stage shares
  (kinds, subkinds, families, schema checks, temporal registry, ref-slot walking).
- [protocol/](pkg/protocol/): Go ⇄ JS wire envelope (ops, Request/Response, scan sites, Site demand).
- Auxiliary, small, no cross-package state: `constants`, `jsquote`, `testfixtures` (F1..F17 fixtures), `textpos`.

## Extension points

A binary built on mion calls `cli.Main(args, cli.Extension{…})`; `cmd/mion` passes none.

- One table per kind: verbs (`cli.Command`), tsconfig plugin keys, serve/compile flags (`cli.SessionFlags`), ops
  (`resolver.Op`), scan checks, genDir entries, diagnostic codes, areas and families (`diagnostics.Register*`).
- mion's own rows sit in the SAME tables: one code path. A registered name panics unless the row sets `Replace`;
  `Replace` on an absent name panics too, so the bump that deletes a built-in forces a plain row.
- The `capabilities` op lists the extension rows only (`Owner != ""`); the public binary answers it empty.
- ⚠️ An extension never feeds a typeID, fnHash or disk fingerprint (`Options.Ext` included): no public answer moves.

## Area rules

- Whole-type rules: [reflection/AGENTS.md](pkg/reflection/AGENTS.md). Read before a rule over a whole type.
- ⚠️ Pure fn id = SHIPPED body hash: [purefunctions/AGENTS.md](pkg/cachegen/purefunctions/AGENTS.md).
  Read before changing what an id is made of: ruled-out alternatives + counterexamples live there.
- Pure fns from installed packages: [purefnindex/AGENTS.md](pkg/cachegen/purefnindex/AGENTS.md).
  Read before touching the `mion-pure-fns/` artifact lane.
- JSON decoder guards, format error keys: [typefunctions/AGENTS.md](pkg/cachegen/typefunctions/AGENTS.md).
  Read before adding a decoder arm, format or format param.
- Diagnostic Levels: [diagnostics/AGENTS.md](pkg/diagnostics/AGENTS.md). Read before picking a code's Level.
- Platform classes, `URL`, readonly: [typeid/AGENTS.md](pkg/cachegen/runtype/typeid/AGENTS.md).
  Read before changing what counts as data or what enters a type id.
- Installed package types: [compiler/AGENTS.md](pkg/compiler/AGENTS.md). Read before reusing shipped ids or code.
- New or changed diagnostic or emit arm → run [add-diagnostic](../.agents/skills/add-diagnostic/SKILL.md).

## Marker test coverage rule

Any test exercising the marker API: Go under [pkg/](pkg/) AND the JS plugin under
[packages/devtools/test/](../packages/devtools/test/).

- MUST cover both `getRunTypeId` call shapes: static `getRunTypeId<T>()` (caller supplies T, no value)
  AND reflection `getRunTypeId(value)` (T inferred from the value).
- Paired tests, not parameterized. Natural shape per intent: `getRunTypeId<string>()` vs
  `const s: string = 'hello'; getRunTypeId(s);`. Both resolve to the same cache entry for equivalent T.
- ≥1 paired test per suite asserts hash equivalence of the two forms
  (`TestAtomic_FormEquivalence` in [atomic_test.go](pkg/compiler/resolver/atomic_test.go)).
