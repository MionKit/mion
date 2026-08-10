---
type: feature
spec: full-plan
status: done
created: 2026-08-09
completed: 2026-08-10
---

# Convert marker CALL SITES, and run the whole suite tree in all three forms

## Problem

The suites are the project's real corpus — 205 files, every construct the engine
reflects — and they only ever run in ONE notation. The convert command exists to
prove the three notations are interchangeable, but the only thing testing that
today is generated fuzz input. Converting the suites and running them would test
the converter against hand-written, intentional code, and would run the whole
engine test surface three times over.

Two things block it:

1. **Convert only rewrites named DECLARATIONS.** The suites declare types inline
   in the factory type argument — `createValidateFn<{id: string}>()` — roughly
   1876 sites against a much smaller number of named declarations. Verified:

       export const isUser = createValidateFn<{id: string; age?: number}>();
       interface Named {id: string}
       export const isNamed = createValidateFn<Named>();

       $ ts-runtypes convert --to builders main.ts
       export const isUser = createValidateFn<{id: string; age?: number}>();  ← untouched
       const namedRT = RT.object({id: TF.string()});                          ← converted
       type Named = InferType<typeof namedRT>;
       export const isNamed = createValidateFn<Named>();

   So converting the suites today is close to a no-op.

2. **There is no lane.** No `.converted` directory, no gitignore entry, no rtx
   command, no vitest project, nothing in the release gate.

## Phase 1 — convert rewrites an inline type argument into a VALUE argument

Not a hoist into a named declaration: rewrite the call in place.

    createValidateFn<{id: string; age?: number}>()
    → createValidateFn(RT.object({id: TF.string(), age: RT.optional(TF.number())}))
    → createValidateFn(runTypeFromJsonSchema({type: 'object', …} as const))

No naming, no placement, no collisions — and it is the API's own contract
already: every factory's FIRST parameter is `RunType<T>`, with the type-first
shape as a second overload. Confirmed across the surface in
`packages/ts-runtypes/dist/createRTFunctions.d.ts:56` and the per-factory
declarations: `createValidateFn`, `createGetValidationErrorsFn`,
`createCloneExactShapeFn`, `createHasUnknownKeysFn`, `createUnknownKeyErrorsFn`,
`createFormatTransformFn`, `createMockDataFn`, `createStandardSchema`,
`createJsonEncoderFn`, `createJsonDecoderFn`, `getRunTypeId`.
`packages/ts-runtypes/src/index.ts:168` states the intent outright: "a
value-first `RunType` schema as the first arg … is a distinct overload from the
type/value reflection form — both reflect `T`".

### The rule

Rewrite a marker/factory call when, and only when, it has an **explicit type
argument** and **no first value argument**. That single condition keeps the
REFLECTION form untouched — `createValidateFn(sample)` and `getRunTypeId(sample)`
pass a runtime value and must stay exactly as written (the Marker test coverage
rule depends on both shapes surviving).

Slots line up on both overloads (`(runType, options?, id?)` vs
`(val?, options?, id?)`), so a call that passes options type-first
(`createValidateFn<T>(undefined, {…})`) becomes `createValidateFn(<expr>, {…})` —
the placeholder disappears rather than shifting anything.

A type argument that is already a NAME (`createValidateFn<Named>()`) is left
alone: the named declaration converts on its own and the reference keeps working
through `InferType<typeof namedRT>`.

### Where it hooks in

`ConvertFile` (`ts-go-runtypes/internal/convert/convert.go:99`) walks
`recognizeFile`'s DECLARATIONS. Call sites are a second collection pass over the
same source file, planned into the same edit list, printed by the same three
printers — `builderExpr` / `schemaExpr` / `typeExpr` in `print.go` already render
exactly the expression needed, and `imports.go`'s managed block already adds the
`RT` / `TF` / `runTypeFromJsonSchema` bindings.

Going back to `--to type` is the mirror: `createValidateFn(RT.object({…}))` with
no type argument → `createValidateFn<{…}>()`. Reuse `isConvertibleTargetDecl`'s
notion of form detection (`set.go:412`) rather than inventing a second one.

The resolver already models a call's runtype slot — `protocol.Site.ParamIndex`
(`internal/protocol`, line ~340) is the slot the injected id occupies — so the
site model to key on exists; do not invent a parallel one.

### What must NOT move

The structural id. `createValidateFn<T>()` and `createValidateFn(<builder for T>)`
resolve to the same id by construction — that is what the whole value-first
surface rests on — and the conversion is only correct if it holds at every site.
This is the phase's primary oracle.

## Phase 2 — the converted-suites lane

### Layout (one directory per target, gitignored)

    packages/ts-runtypes/test/.converted-builders/
    packages/ts-runtypes/test/.converted-json-schema/

**Siblings of `suites/`, not `.converted/<target>/`** — a depth thing, and it is
load-bearing. Suite files import `../../util/*.ts` (~90 sites across 6 files) and
`../../../src/runtypes/types.ts` (4 sites). From
`test/.converted-builders/validation/File.ts` those resolve to `test/util` and
`packages/ts-runtypes/src` exactly as they do from `test/suites/validation/`.
Nest one level deeper and both break. The alternatives (rewriting the relative
specifiers, a `paths` alias, a symlink) all add machinery to buy nothing.

Gitignore `packages/ts-runtypes/test/.converted-*/`.

### Generation

`convert --out-dir` already does copy-then-convert: `copyIntoOutDir`
(`ts-go-runtypes/cmd/ts-runtypes/convert_cli.go:180`) `os.CopyFS`s the root and
re-roots the file list, and `expandConvertArgs` (`:128`) walks a directory
argument for `.ts` / `.tsx`. So generation is one CLI call per target:

    ts-runtypes convert --to builders     test/suites/ --out-dir test/.converted-builders/
    ts-runtypes convert --to json-schema  test/suites/ --out-dir test/.converted-json-schema/

Some files will refuse — verified today: generic helper aliases (CNV002) take out
`validation/Utility.ts` and `validation/TypeMappings.ts` wholesale, plus
symbol-keyed members and stacked `propertyNames`. The lane needs an
**expected-failure list** that fails when a listed file STARTS converting, the
same discipline as `packages/ts-runtypes/test/features/unsupported-conversion.test.ts`.
Never a silent skip.

### The rtx command

    pnpm rtx core converted-suites [--target builders|json-schema] [--keep]

Generate → run vitest over the converted dirs → delete them, with the delete in a
`finally` so a failing run still cleans up (`--keep` opts out for debugging). Two
precedents to copy rather than reinvent:

- **`packages/ts-runtypes/test/json-schema-official/generated/`** — generated test
  modules, gitignored (`.gitignore:101`), its own vitest project and tsconfig,
  regenerated by `check:builds`. This is the same shape.
- **`packages/ts-runtypes/test/util/enrichGen.ts:186`** — per-lane temp dirs
  removed in `afterAll`; the cleanup half.

The converted dirs need their own vitest project entry and a tsconfig extending
`tsconfig.test.json`, mirroring what `packages/ts-runtypes/test/tsconfig.json`
does for `test/**`.

### CI

One job in `.github/workflows/release-gate.yml` — the pre-publish gate, beside
the `fuzz-soak` job added for the same reason. Not `ci.yml`: this converts and
type-checks 205 files twice and would be paid on every PR.

## Tests

- **Phase 1, Go** (`ts-go-runtypes/internal/convert/`): call-site rewriting per
  target, both directions, with `declIDs` before/after asserting the id never
  moves. Cover: the plain type-first call; a call carrying `options`; a type
  argument that is already a name (must stay); the reflection form
  `createValidateFn(sample)` (must stay); `getRunTypeId<T>()` AND
  `getRunTypeId(value)` in the same fixture — the Marker test coverage rule,
  paired not parameterized, with one hash-equivalence assertion between them; a
  `DataOnly<T>` argument, whose resolved projection must round-trip to the same
  id.
- **Phase 1, FE**: extend the existing roundtrip lane
  (`packages/ts-runtypes/test/fuzz/convert/convertRoundtrip.ts`) so generated
  files carry marker call sites in both shapes, and the per-leg id oracle covers
  them.
- **Phase 2**: the lane IS the test. Add a repo-contract check that the
  expected-failure list matches what the converter actually refuses.

## Docs

- `container/website/content/02.guide/11.converting-forms.md` — call-site
  conversion is user-facing and belongs in the guide, with an example. Keep the
  house voice (no dashes chaining clauses, `<code-import>` over hand-written
  fences, examples from `packages/examples/src/`).
- `docs/ARCHITECTURE.md` — convert's scope changes from "declarations" to
  "declarations + marker call sites".
- `packages/ts-runtypes/test/fuzz/README.md` and `docs/FUZZING.md` if the
  roundtrip lane grows call sites.

## Fuzzing

Phase 1 is a natural fuzz candidate and the oracle already exists: the roundtrip
lane's per-leg id check. Generating call sites alongside declarations costs one
generator arm and reuses every oracle.

## Out of scope

- Hoisting an inline type argument into a NAMED declaration. Explicitly rejected
  in favour of the inline value form.
- Converting the suite sources themselves. `test/suites/` stays type-first; the
  converted trees are generated, gitignored and deleted.
- The third target. `--to type` over the suites is a near no-op (they are already
  type-first); the lane covers `builders` and `json-schema`.

## Done when

`ts-runtypes convert` rewrites marker call sites in every direction with the
structural id pinned at each one; `pnpm rtx core converted-suites` generates,
runs and removes both converted trees; the trees are gitignored; the
expected-failure list is honest and fails when a refusal is fixed; the release
gate runs the lane; the website guide documents call-site conversion.

## What shipped

All of it, plus six defects the conversion surfaced. **18,264 tests pass across
the two converted trees** (`pnpm rtx core converted-suites`), against 24 / 25
refusals per target — all documented limitations, and the counts are pinned so a
regression or a fix both fail the lane until the number is updated.

Deviations from the plan, and why:

- **Layout is `test/converted-<target>/`, not `.converted-<target>/`.** Vitest's
  globs do not match dot directories, so the trees were invisible. They are
  excluded from the other lanes by name instead (the `json-schema-official`
  pattern) and gitignored.
- **The enrich CLI lanes are excluded** (`enrichTranslate`, `enrichReconcile`),
  and only those. They drive the CLI over fixture projects they generate at
  runtime through an absolute `.tmp` root, so three copies reconcile on top of
  each other. Nothing about them exercises the conversion. Recorded in
  `vitest.converted.config.ts`.
- **A generic declaration warns instead of erroring.** It has no runtime shape,
  so there is nothing to convert — the same reason classes and functions are
  skipped. As an error it failed a whole file over one type-level helper. The
  row left `unsupported-conversion.test.ts` and the website table.

### Defects found by converting the suites

Each was fixed with the conversion it blocked; the first two account for 519 of
the 526 diagnostics the first run produced.

1. **A name this file cannot SPELL is not a failure** — an unexported alias, or
   a type the reflection graph reached structurally, refused with CNV004. It
   inlines now: same id, one lost name. (430 diagnostics.)
2. **A reference through a PACKAGE import can never be "added to the run"** —
   `TF.String`, `FromJsonSchema`. Advice the user cannot act on. (47.)
3. **A call sees its enclosing block's names**, not just the file's top level.
   The suites declare classes and enums inside thunks, and the calls reflecting
   them refused as "not in scope here". (89.)
4. **A call that already names its type is left alone** — converting one whose
   type is a thunk-local recursive interface has no name to close the cycle on.
   (41.)
5. **A RunType-typed const only converts when the builders authored it.** The
   mocking suites assemble graphs by hand; reprinting one from its resolved type
   replaced it with an EMPTY schema. Data loss, not conversion.
6. **`getRunType` nested in a factory lost its id** — a pre-existing scanner
   bug, exempted now and pinned by
   `packages/ts-runtypes/test/features/nestedMarkerCalls.test.ts`. Filed
   separately as `docs/done/nested-getruntype-loses-its-id.md`.

Two more, found by the tests rather than the suites: a type-only namespace
import was adopted to spell VALUES (`TF is not defined` at runtime) and now
folds into the managed block as a value import; and the reflection form was
matched by a bare generic-reference test, so `getRunTypeId(promiseProbe)` was
rewritten to its first type argument — caught by the FE roundtrip lane on seed
133220833, now gated on `builders.IsRunType`.

`deserializeValidate` and its seven siblings gained the `RunType<T>` overload
their runtime already accepted, so the deserialize half of the suites runs
value-first too.
