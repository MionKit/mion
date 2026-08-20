---
type: feature
spec: full-plan
status: ready
created: 2026-08-20
---

# Elide reflection graphs for unused builder consts (always on)

## Problem

Every value-first builder call (`const myRT = RT.object({...})`) is a reflection
root: the build emits the type's full graph into the runtype bundle so the const
can return the live node. But when the const's VALUE is never used — the common
pattern being `type X = InferType<typeof myRT>` followed by `createValidateFn<X>()`
— the graph is dead weight in the bundle. The decoupling work
(feature/runtype-cache-decoupling) already removed every incidental runtime
dependency on the graph, so eliding it is purely an emission decision.

This runs UNCONDITIONALLY — no config flag. The analysis is per-file with a
name prefilter (one walk of the declaring file per builder const), so its cost
is negligible; the original flag idea assumed whole-program scanning, which is
out of scope.

Acceptance pair (the contract):

- `type X = InferType<typeof myRT>; createXFn<X>()` → ONLY the function cache.
- `createXFn(myRT)` → BOTH caches (value use ⇒ graph kept).

## Plan

**Scanner elision** (`internal/compiler/resolver/scan.go`, the single-trailing
branch of `analyzeCall`, ~line 650): a site is an elision CANDIDATE when

- it is reflection-only (no fn keys), and
- the callee's resolved return type is `RunType<...>` (probe via
  `builders.IsRunType` on `Checker_getReturnTypeOfSignature`, same as
  `builders.IsBuilderLeafCall`, `internal/compiler/builders/builders.go:75`), and
- it is NOT `getRunType` (`builders.IsIdLookupCall`, builders.go:50) — getRunType
  THROWS without an injected id; builders return their carrier, which is benign
  because nobody reads it, and
- the call's result is UNUSED per the analysis below.

When elidable: still run the site analysis for DIAGNOSTICS, then drop the
pending site. Everything downstream follows for free — no rewrite injection, not
a reflection root (`cachegen/runtype/entries.go` reflectionRoots), the type is
never interned, no graph rows emitted. The function caches a `createXFn<X>()`
site demands are untouched (they never came from the builder site).

**Unused analysis** (new helper, suggested
`internal/compiler/builders/usage.go`; model the reference walk on convert's
`constUseIndex`, `internal/convert/set.go:120-170` — same
`GetSymbolAtLocation` + `SkipAlias` symbol matching with a name prefilter).
Climb the call's Parent chain through parentheses / `as` / `satisfies` /
non-null:

- Parent is an ExpressionStatement (result discarded) → elidable.
- Parent is a `const` VariableDeclaration with a plain Identifier binding and
  the statement carries NO export modifier → walk THIS file for identifiers
  resolving to the const's symbol and classify each:
  - an ancestor is a TypeQuery node (`typeof myRT` in TYPE position, which is
    what `InferType<typeof myRT>` produces) → type-only use, ignored;
  - an ExportSpecifier (`export {myRT}` / `export {myRT as x}`) → used;
  - ANY other position (call argument — including `createXFn(myRT)` and builder
    composition — property access base `myRT.kind`, return, assignment, spread,
    template, value-position `typeof`) → used.
  - No uses found → elidable.
- Every other consumer (argument position, `let`/`var`, destructuring,
  `export default`, exported statement) → NOT elidable.

**Locked decisions:**

- Exported = ALWAYS kept. The analysis is per-file so verdicts stay file-local:
  an edited file re-scans and its own verdict updates with it — no cross-file
  dev-server invalidation machinery. Docs teach the composing pattern: export
  the TYPE (`export type X = InferType<typeof myRT>`), not the schema const.
- Default-deny: anything the classifier does not positively recognize as a
  type-only use counts as a value use and keeps the graph.
- No flag, so the escape hatch is the semantics themselves: using the value or
  exporting the const keeps its graph. `eval`-style dynamic access to an
  otherwise-unused const is unsupported (document it).

## Tests

Go (`internal/compiler/resolver/`, scopeScan-style via `setupInline`;
assertions via `entrymodules_helpers_test.go`):

- The acceptance pair: InferType + static form → NO `rts_` bundle, val entries
  present; `createValidateFn(myRT)` → bundle present + val entries.
- Exported const (modifier) kept; `export {myRT}` specifier kept.
- `myRT.kind` property use kept; `let` binding kept; expression-statement
  builder call elided.
- `getRunType<T>()` with unused result still emits (never elided).

FE end-to-end (SHIPPED as two tests):

- `packages/ts-runtypes-devtools/test/unused-runtypes-elision.test.ts` — the
  acceptance pair at cache level over the inline daemon: the static form emits
  one site and zero runtype modules while its materialised validator behaves;
  the value form keeps both sites, the `runtypes` bundle instantiates, same
  validator behavior.
- `packages/ts-runtypes/test/features/unusedBuilderElision.test.ts` — through
  the REAL vitest plugin: the elided lane registers no graph at runtime (and
  the module executes fine on the carrier fallback — note the elided const can
  be referenced NOWHERE in the test, since any reference is itself a value
  use), the kept lane's graph registers and its const IS the live node, plus
  the paired `getRunTypeId` shapes with a convergence assert (CLAUDE.md rule).

Because the behavior is default-on, the ENTIRE existing Go + JS suite acts as
the regression net: audit any existing fixture whose builder const becomes
newly elidable (a const built and only reflected via cache assertions) and
update its expectations or give it a real use — surface anything surprising.

## Docs

- **Homepage** `container/website/content/index.md` (~line 203, the "both
  compile to the exact same validator" copy + nearby example): favor the
  static form — `type X = InferType<typeof myRT>` then `createValidateFn<X>()`
  — as the headline pattern, noting the builder itself then adds zero generated
  data. index.md is hand-tuned: scoped API-truth edit only, verify
  MDC-component and code-fence counts match the pre-edit baseline.
- **Type-builders guide** (page + `packages/examples/src/guide/
  type-builders-*.ts`, `structural-formats.ts`, `convert-forms.ts`): flip the
  default style to InferType + static form; KEEP one deliberate value-form
  example (the form stays supported and documented). Add a short plain-language
  note on the behavior: a schema you only take the type of ships no reflection
  data; using or exporting the schema value keeps it.
- **Playground** (audited; deliberate divergence from the original bullet):
  the playground's TWO MODES exist precisely to demonstrate the two call
  shapes — `ts` mode IS the static form, and builder mode's value-first
  `createX(MyType)` call is the mode's subject (the engine's site handling
  depends on it). Converting builder mode would delete the value-form demo
  from the site. Shipped instead: the presets header documents that the
  recovered type is the recommended handle in an app (zero runtype cache) and
  that builder mode keeps the value-first call on purpose; every preset
  already closes with `type X = InferType<typeof MyType>`.
- `docs/ARCHITECTURE.md`: extend the "Only what you ask for" paragraph — an
  unused builder const now emits nothing; using or exporting it keeps the graph.

## Fuzzing (SHIPPED — user opted in)

New `elision` lane under `packages/ts-runtypes/test/fuzz/elision/`
(`pnpm rtx core fuzz elision`, quick/soak via `RT_FUZZ_ELISION_SOAK_MS`, wired
into the rt.mjs FUZZ registry / env registry / .env.sample / ci.yml /
fuzz-soak.yml, all pinned by fuzz-lane-contracts). Per generated builder schema
(a deliberately narrow JSON-pure generator, `builderGen.ts`) both spellings
compile through the real resolver and the oracles check: E0 fixture integrity
(exactly three createX sites per spelling), E1 entry equivalence (every module
the static form emits exists BYTE-IDENTICALLY in the value form's output —
stronger than probing values, since both spellings share type id + fnHashes),
E2 emission split (static: no bundle, no reflection site; value: both kept),
E3 behavior floor on the static form (validate accepts/rejects correctly, JSON
round-trip, no Error diagnostics). Negative controls in
`elisionOracle.unit.test.ts` prove every oracle fires on broken output. The
lane's first run caught a generator bug (wrong union arity typing to `any`) —
E0 exists because of it.

## Out of scope

- Whole-program elision of exported-but-never-used consts (needs a cross-file
  use index plus dev-server invalidation of OTHER files' transforms when a use
  appears/disappears — possible follow-up, file separately if wanted).
- Eliding `getRunType` / `getRunTypeId` / `createMockDataFn` sites (their
  runtime bodies throw or genuinely need the graph).
- Smarter treatment of builder-composition arguments (`object({child})` counts
  as a value use of `child` even though the composer discards it at runtime —
  conservative and correct; refine later if it matters).
- Any configuration knob — the behavior is unconditional by design.

## Done when (MET)

- The acceptance pair is pinned by the Go tests
  (`internal/compiler/resolver/unused_runtypes_test.go`, 8 cases) and both FE
  tests; the fuzz lane holds it over generated schemas.
- Homepage (`define-builder.ts` + index.md copy) and the type-builders guide
  (side-by-side example + a new prose paragraph) favor the static InferType
  form; the value form stays demonstrated in the mixed/labeled examples and
  the playground's builder mode (see the playground note above).
- Existing suites audited: zero fixtures relied on unused builder consts (full
  Go + JS suites green unchanged). `pnpm run lint`, `pnpm run format`,
  `pnpm test` (9354 passed), `go -C ts-go-runtypes test ./internal/...`, and
  `pnpm rtx core fuzz elision` (default + 15s local soak) all green.

## Implementation notes

- Analysis helper: `ts-go-runtypes/internal/compiler/builders/usage.go`
  (`IsValueBuilderCall` + `UnusedBuilderConst`); the scanner drops the pending
  site in `internal/compiler/resolver/scan.go`'s single-trailing branch, AFTER
  analyzeTrailingInjection so the site's diagnostics are kept.
- The runtype bundle's MODULE basename is the fixed `runtypes`
  (entrymodules.ModuleName special-cases the bundle kind) — assertions that
  grep for the `rts_<hash>` entry key alone are vacuous.
