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

FE end-to-end (devtools test, e.g.
`packages/ts-runtypes-devtools/test/unused-runtypes-elision.test.ts`, on the
normal shared inline client since the behavior is default): compile + EXECUTE
both acceptance sources via `evalCacheFor`:

- static-form source: cache contains no runtype rows, the validator runs and
  validates correctly;
- value-form source: runtype rows present, validator correct;
- the elided builder const evaluates without crashing (carrier fallback).
- Marker coverage rule: pair both `getRunTypeId` shapes with a convergence
  assert somewhere in the suite (CLAUDE.md rule).

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
- **Playground presets** (`container/website/app/playground/presets.ts`, plus
  `engine.ts` if it appends usage code): presets already end with
  `type X = InferType<typeof MyType>` — audit every preset (and any generated
  companion snippet) so the createXFn usage is the static form.
- `docs/ARCHITECTURE.md`: extend the "Only what you ask for" paragraph — an
  unused builder const now emits nothing; using or exporting it keeps the graph.

## Fuzzing

Cheap oracle: for a corpus of builder-based sources, the compiled functions of
the static-form and value-form spellings of the same type must BEHAVE
identically (validate / encode / decode outputs match on the same inputs) —
elision changes emission size, never behavior. Optional lane; wire into the
existing fuzz harness style under `packages/ts-runtypes/test/fuzz/` if time
allows.

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

## Done when

- The acceptance pair is pinned by both the Go tests and the FE e2e test.
- Homepage, type-builders guide examples, and every playground preset favor the
  static InferType form; the guide documents the behavior in plain language.
- Existing suites audited for newly-elidable fixtures; `pnpm run lint`,
  `pnpm run format`, full `pnpm test`, and
  `go -C ts-go-runtypes test ./internal/...` green.
