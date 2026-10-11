---
type: feature
spec: full-plan
status: done
created: 2026-10-11
---

# Typed generated code: `emitMode: 'ts'`

## Problem

Compilers that turn TypeScript into native code use types to optimise. RunTypes resolves every
type at build time, but everything it generates is untyped JavaScript:

- Default `emitMode: 'code'` ships each compiled fn only as a STRING. The runtime rebuilds it with
  `new Function('utl', code)` (`packages/run-types/src/runtypes/rtUtils.ts:252`). A native compiler
  sees a string literal, not code.
- `'both'` / `'functions'` ship a live factory, but it is untyped: `function g_K(utl){… function K(v){…}}`
  (`ts-go-runtypes/internal/cachegen/typefunctions/printclosure.go:15-26`, `walker.go:447`, `walker.go:668`).
- Entries call each other through the registry, `const X = utl.getRT('X')` then `X.fn(v)`
  (`typefunctions/emitter.go:253-283`). `getRT` returns `fn: AnyFn` (`rtUtils.ts:65`).
- Files are `.js` (`internal/compiler/resolver/generate.go:23`), so the user's tsc never checks them.

Measured, `mion compile --emit-mode both`: private-test-server writes 785 fn entries over 175 type ids
(4.5 entries per id, max 11). private-examples writes 643 over 159 (4.0, max 12). Printing a type into
every fn would repeat it about 4x, plus nested repeats (`Address` printed twice inside one `User`).

The code STRING must stay plain JS: it feeds `new Function` on the client and is how compiled fns
serialize to the client. So the typed factory and the string differ, and must stay provably the same logic.

## Decisions (settled with the user)

- New `emitMode: 'ts'`. It writes `.ts` cache modules: a typed live factory per entry, plus the
  code string, byte-identical to `'both'`. One enum value instead of a boolean, so "typed + code-only" can't exist.
- One TYPE MODULE PER TYPE ID: `<genDir>/types/t/<typeId>.ts` exports `T_<typeId>`. It is the data-only
  projection, printed concretely by Go, with children referenced by `import type`. Same keying as the
  fn cache (`<fnHash>_<typeId>`).
- NEVER import or reference the user's own declarations (circular imports, unexported or local types,
  name clashes from structural dedupe). Every type the generated code names is printed by Go.
  The same applies to pure fns: their typed source text references user types, so it is NOT reused.
- Import paths in `'ts'` mode end in `.ts`. Users need `allowImportingTsExtensions` or
  `rewriteRelativeImportExtensions`. In exchange, Node type stripping, Bun, Deno, Vite and esbuild run it as is.
- The JSON side is typed `unknown` (encoder output, decoder input, prepare / restore wire value).
- Inside a fn body, the input stays `any`. Precise types sit on every fn boundary:
  `(v: unknown) => v is T_x`, `(v: T_x) => T_x`, …

Target output for `createValidateFn<User>()`:

```ts
// <genDir>/types/t/mn8nDjJ.ts
import type {T_j45Rp1D} from './j45Rp1D.ts';
import type {T_GA3qWad} from './GA3qWad.ts';
/** User */
export type T_mn8nDjJ = {id: number; name: string; email?: string; createdAt: Date; address: T_j45Rp1D;
  roles: ('admin' | 'user')[]; meta: T_GA3qWad};
```

```ts
// <genDir>/types/Eq2V_mn8nDjJ.ts
import type {RTUtils, FnTypeTuple} from '@mionjs/run-types/runtime';
import type {T_mn8nDjJ} from './t/mn8nDjJ.ts';
import type {T_j45Rp1D} from './t/j45Rp1D.ts';
import {__rt_Eq2V_j45Rp1D} from './Eq2V_j45Rp1D.ts';
export const __rt_Eq2V_mn8nDjJ: any=['val',()=>[__rt_Eq2V_j45Rp1D],undefined,'Eq2V_mn8nDjJ','User',
  '<code string, byte-identical to both mode>',,['Eq2V_j45Rp1D'],,
  function g_Eq2V_mn8nDjJ(utl: RTUtils): (v: unknown) => v is T_mn8nDjJ {
    const Eq2V_j45Rp1D = utl.getRT<(v: any, ...rest: any[]) => v is T_j45Rp1D>('Eq2V_j45Rp1D')!;
    const ctxFn0 = function(v: any){…};
    function Eq2V_mn8nDjJ(v: any): v is T_mn8nDjJ {…same body…}
    return Eq2V_mn8nDjJ}] satisfies FnTypeTuple;
```

## Plan

### 1. The mode

- `internal/constants/constants.go:436-468`:
  - add `EmitTS EmitMode = "ts"`
  - `EmitsCode()` and `EmitsFactory()` both return true for it
  - new `EmitsTypes()`, true only for `ts`
  - extend `Valid()`
- `cmd/mion/main.go:65` (usage), `:166` (flag help), `:317-319` (error text): add `ts`.
  - tsconfig key `emitMode` (`cmd/mion/config.go:65`) needs no change.
  - Precedence (`buildconfig.go:76`) needs no change.
- Disk cache: `diskcache/fingerprint.go:20-21,63` already folds the mode in, so `ts` gets its own dir.
  - `ArgsText` stores the final text with no marks, so `FormatVersion` stays.
- devtools:
  - `packages/devtools/src/core/unplugin.ts:77`, `core/resolver-client.ts:36`: add `'ts'` to the unions.
  - `src/options.ts:36`: `'code' | 'both' | 'ts'`. `ts` keeps the code string, so mion's client serialization still works.
- Overrides: `cmd/mion-wasm/main.go:60` and `resolver/apigen.go:429` force `functions` and stay as they are.
  The api mirror is client-only.

### 2. Type marks: one walk, two renders

- Add `typefunctions/tsmark.go`:
  - `tsAnn(text)` wraps a TS-only fragment in `\x02…\x02`.
  - `jsText(s)` deletes every marked span.
  - `tsText(s)` drops only the delimiters.
  - `jsquote` escapes every C0 control (`internal/jsquote`), so a quoted user literal can never contain a raw `\x02`.
- Where marks are emitted:
  - `walker.go:668` `argsList`: `name` + `tsAnn(": "+type)` (+ `=default`). Types come from the emitter (below).
  - `walker.go:447`: return-type mark after `)`.
  - `walker.go:777` `createFnInContext`: every ctxFn param gets `tsAnn(": any")`.
  - `emitter.go:253` `registerRTLookup`: `utl.getRT` + `tsAnn("<"+childSig+">")` + `('X')` + `tsAnn("!")`.
    `childSig` is the child family's signature over `T_<childId>`, from the dep's own emitter, not the parent's.
    Example: a serializer body can look up a validator, which needs the validator's signature.
  - `emitter.go:325-332` `UsePureFn`: `utl.getPureFn('id')` + `tsAnn("!")`.
  - Every emitter-built local that TS can't infer: object or array accumulators (`const _r = {}`,
    `const r0 = {}`), `let cs_<id>, cs_<id>_ep` (`class_serializer.go:57`), `const pred = (k) =>`
    (`unknownkeys_shared.go`). Each gets `tsAnn(": any")`.
    The strictest-tsconfig lane (Tests) is the completeness check: any site this list misses fails it.
  - `printclosure.go:15` `WrapClosure`: `utl` + `tsAnn(": RTUtils")` + `tsAnn(": "+factorySig)`.
- Noop detection (`Finalize`) and every text-shape check run on `jsText(...)`. A mark must never change a verdict.
- `module.go:614-621`: the code slot is `quoteJS(jsText(factoryBody))` in every mode.
  - The factory slot is `jsText(createRTFn)` for `functions` / `both`, and `tsText(createRTFn)` for `ts`.
  - Same split in `override.go:59-66` (cast `utl.usePureFn(k)` + `tsAnn(" as "+sig)`) and
    `json_composite.go:166-179,237-296`: `const pjsFn = utl.getRT<sig>(…)!.fn`, inner `(v: T_x)` / `(s: string)`.
- Signatures: one table keyed by family tag (`typefunctions/tsmark.go` `tsSignatures`), shared by the walker and
  the JSON composites. A tag is enough, so no `Emitter` method. Loose rows (marked below) return `any` inside and the
  factory casts once: `return K as unknown as <fn type>`, since an any-typed body cannot meet a precise or `never` result.

| Tags | Signature |
|---|---|
| val vst vuk | `(v: unknown) => v is T` (inner `v: any`) |
| verr vest veuk | `(v: unknown, pth?: RTValidationErrorPathSegment[], er?: RTValidationError[]) => RTValidationError[]` |
| ruk ruks rukr, fmt | `(v: T) => T` (loose) |
| pj pjs cj | `(v: T) => unknown` |
| rj rjs cjr | `(v: unknown) => T` (loose) |
| jeCL jeMU jeCO | `(v: T) => string \| undefined` |
| jdCL jdMU jdCO | `(s: string) => T` (loose) |
| jsc | `(v?: unknown) => unknown` |
| csr | `(v?: unknown) => string \| null` |

- Add a coverage test `TestTsSignature_EveryFamilyHasARow` over `families.go:26-58` + `constants.go:142-149`.
  It fails on a family with no row (AGENTS walk-coverage rule).

### 3. Type modules (one per type id)

- Printer: `internal/convert`. Add two flags to `printFlags` (`print.go:66-78`), checked inside the arms.
  No second dispatch (AGENTS visitor rule).
  - `flagsReferenceChildren`: at the top of `typeExpr` (`printtype.go:79-86`), beside the `aliasRef` check.
    A `referenceWorthy` (`print.go:200`) node other than the root prints `DeclRef("t:"+id)`.
    Key on the TYPE node (a member's `.Child`, a param wrapper's `.Child`), never on `_pr_` / `_tm_` / `_idx_` /
    `_pa_` member ids (`cachegen/runtype/serialize.go:917,1061,1139,1190`).
  - `flagsDataOnly`: skip members `reflection.NonDataOf` (`reflection/nondata.go:7-49`) marks as non-data.
    Same rule as `schemadoc/render.go:469-485`: methods, call signatures, symbol keys, never.
    - A user class prints as the structural object of its data members.
    - An enum prints as the union of its literal values.
    - So no `declare class` / `declare enum` statement is ever emitted.
    - Date, URL, Map, Set, Temporal, RegExp and format brands keep today's spellings.
      `FormatImports()` (`printdecl.go:142`) is printer-wide: per module, recompute what that module's text needs.
  - A `NewTypeModulePrinter(resolve)` constructor sets both flags plus `flagsSortMembers`.
  - Extend the convert coverage tests (`TestPrinters_EveryKindHasAnArm`, `TestPrintersCoverRunType`) for both flags.
- Entries (`internal/compiler/entrymodules/entrymodules.go`):
  - New `KindTypeDecl`, module name `t/<typeId>`, rendered only when `EmitsTypes()`.
  - New `Entry.TypeImports []string`: rendered as `import type {T_x} from '…'` lines.
    Excluded from the deps thunk, `levelOrder`, `Cascade` and `AddMissingStubs`, because type-only cycles are legal.
  - `renderModule` (`:475`) / `renderBundle` (`:543`) render a `KindTypeDecl` as imports + `/** <typeName> */` + `export type T_<id> = …;`.
  - The `ts` header on every non-type module adds the `@mionjs/run-types` / `/runtime` type imports it uses.
  - Each `export const` gets `: any` plus ` satisfies FnTypeTuple` (or `PureFnTuple` / `RunTypeBundleTuple` /
    `RunTypeFacadeTuple` / `MissingTuple`), so `isolatedDeclarations` passes and importers keep the loose JS shape.
    Head holes (kind, deps, ini) are written `undefined`; trailing holes stay holes.
- Collect: in `resolver/dispatch.go:80` `collectEntryModules`, after the families and composites merge (`:88-97`):
  - when `EmitsTypes()`, collect every type id a live type-fn entry names (its root + every `T_` its signature or marks reference)
  - render one `KindTypeDecl` per id, closing over child ids through the printer's `DeclRefKeys`
  - set `TypeImports` on the referencing entries
  - `sess.cache.NodeByID` is in scope there (`render.go:61`)
- Runtype data bundles + facades (`rt/<hash>`, `cachegen/runtype/entries.go`) become `.ts` too:
  `function ini(rtu: RTUtils){const c=(id: string)=>rtu.useRunType(id);` (`entrymodules.go:510,594`).
- Pure-fn modules (`cachegen/purefunctions/module.go:148` `createPureFnJS`): `cachegen/tsannotate` parses the factory
  and adds `: any` to untyped params, catch bindings and untyped locals, and `_` to unread params and loop variables
  (a `v is T` predicate follows the rename). A `typeof Bun`-only global gets a module-level `declare const Bun: unknown;`.
  The code string and the id hash (shipped stripped body) do not change.
  Package / builtin pure fns served from artifacts (`resolver/package_purefns.go:24`) get the same treatment.
- rpc batch modules (`resolver/rpcgen.go:125-198`) follow the mode (`.ts` + typed). The api mirror stays `.js` `functions`.

### 4. Files and import paths

- `resolver/generate.go:23` `moduleFileExt` becomes a per-session value: `.ts` when `EmitsTypes()`, `.js` otherwise.
  - Used by `materializeModules` (`:361`), `relimports.go:97,112,123`, `rpcgen.go:29,198`.
  - `pruneStaleModules` (`:381-404`) prunes BOTH extensions, so switching modes leaves no stale twin.
- Virtual `rtmod:/X.js` specifiers stay internal (`constants.go:343`, `sourcerewrite/transform.go:209`).
  Relativization (`relimports.go:14-33,55`) writes the mode's extension.
- Next broker (`packages/devtools/src/runtypes/next/broker.ts:183,203`): count and list both extensions.
- `mion compile` (`internal/compiler/batchcompile/compile.go`) in `ts` mode writes TypeScript, not JS.
  A native compiler has no plugin hook, so the rewrite must land on disk as TS.
  - After pass 1 (`:179-200`), skip the pass-2 tsgo emit.
  - Write every program source under `rootDir` to `outDir` with its own extension: the rewritten text for
    marker files, the original otherwise.
  - Relativize with `resolver.RelativizeUserImports(outPath, genDir, text)` (`relimports.go:48`).
  - `SyncArtifactDir` (`:279`) unchanged. `Result.EmittedFiles` lists the `.ts` files.
  - Update `compileUsage` (`cmd/mion/main.go:622`).

### 5. Runtime (`packages/run-types`)

- `src/runtypes/rtUtils.ts:65` `getRT<Fn extends AnyFn = AnyFn>(hash: string): InitializedTypeFn<Fn> | undefined`.
- `rtUtils.ts:122` `getPureFn<Fn extends PureFunction = PureFunction>(…)`.
- `src/runtime/index.ts`: also export `type FnTypeTuple, PureFnTuple, RunTypeBundleTuple, RunTypeFacadeTuple,
  MissingTuple` (`src/runtypes/entryTuple.ts:207-243`).
- No runtime branch on the mode: `materializeRTFn` (`rtUtils.ts:283`) already prefers `createRTFn`.

## Tests

Go:

- **`typefunctions`:**
  - `TestTsMode_CodeSlotMatchesBoth`: render the module-test fixtures and `testfixtures` F1..F17 in `both` and `ts`.
    The code slot and deps match byte for byte. The `ts` factory with marks removed equals the `both` factory.
  - `TestTsMarks_NeverInJs`: no `\x02` in any `jsText`, and a literal type `'\u0002'` round-trips quoted.
  - `TestTsSignature_EveryFamilyHasARow`, then break one row on purpose and watch it fail.
- **convert:** `flagsReferenceChildren` (children become refs, recursion closes through a ref, member ids are never keys).
  `flagsDataOnly` drops methods, symbols and never, prints a class as structural and an enum as a literal union.
  Extend the coverage tests.
- **entrymodules:** a `KindTypeDecl` renders `import type` + `export type`. `TypeImports` never reach the
  deps thunk, `levelOrder` or `Cascade`. A two-module type cycle renders.
- **Mode plumbing:**
  - constants: a table test for `Valid` / `EmitsCode` / `EmitsFactory` / `EmitsTypes`.
  - `diskcache/disk_test.go:188` `TestFingerprint_OptionIsolation`: add the `ts` leg.
  - `cmd/mion/buildconfig_test.go:141-156,251-266`: accept `ts`.
- **`resolver` generate:** `ts` writes `.ts`. A mode switch prunes the other extension.
- **`batchcompile`:** `ts` writes a `.ts` tree under `outDir` with relative `.ts` imports into genDir, and no `.js`.

JS:

- **New `packages/devtools/test/compile-cli-ts.test.ts`.** Model it on `compile-cli-mion.test.ts:163-210`:
  symlink the real `packages/run-types`.
  - The project covers: an interface with Date / bigint / Map / optional / Record, a discriminated union,
    a recursive type, a class with a method, an enum, `createValidateFn`, `createGetValidationErrorsFn`,
    the JSON encoder and decoder, `createRemoveUnknownKeysFn`, a format, a pure fn, and paired
    `getRunTypeId<T>()` / `getRunTypeId(value)` calls with a hash-equivalence assertion (Marker test coverage rule).
  - (a) `tsc --noEmit` over the `ts` output with the STRICTEST tsconfig gives 0 errors:
    - `strict`, `noImplicitAny`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
    - `noPropertyAccessFromIndexSignature`, `noUnusedLocals`, `noUnusedParameters`
    - `verbatimModuleSyntax`, `isolatedModules`, `isolatedDeclarations`, `erasableSyntaxOnly`, `allowImportingTsExtensions`
  - (b) `node <outDir>/main.ts` (Node 26 strips types) and the validators, errors, encode/decode and removeUnknownKeys answer correctly.
  - (c) Strip parity: for each generated module, `stripTypeScriptTypes` (`node:module`) of the `ts` source,
    whitespace-collapsed, equals the `both` module. This proves the native-compiled code and the client
    `new Function` code are the same logic.
- **devtools:** `test/vite/emitMode.spec.ts` and `test/mion-presets.test.ts:17-28` accept `ts`.
  `helpers/entryModules.ts:16` `IMPORT_LINE` stays JS-only (it evals `both`).
- **run-types:** a `vitest.ts-emit.config.ts` lane runs `test/features` with `emitMode: 'ts'`,
  copying `vitest.config.ts:27`, so Vite compiles the typed modules for the whole feature suite.
  Wire it into CI the way the converted config is.

## Fuzzing

Yes. Add a `ts` lane to the type fuzz harness (`packages/run-types/test/fuzz/type/typeFuzzHarness.ts:158`).
Per run, batch every generated module into ONE strictest-tsconfig program. Oracles:

- 0 tsc errors
- strip parity with `both`
- the same validate verdict as `both` on the harness's samples (compare to a trusted source)

Follow the fuzzy-testing skill rules.

## Docs

- `container/website/content/02.runtypes/01.introduction/04.configuration.md`:
  - option table row (`:16`): add `ts`
  - new section "Typed Output": `.ts` files, `T_<id>` type modules, the tsconfig flag
    needed for `.ts` import paths, `mion compile` writing a TS tree for native compilers
- `container/website/content/01.rpc/07.devtools/02.vite.md:132-134`: option type `'code' | 'both' | 'ts'`.
- `container/website/content/01.rpc/07.devtools/04.cli.md:54-63`: Output Locations, `ts` mode row.
- `.agents/docs/architecture.md`: one invariant line, "`ts` mode code slot == `both` code slot, byte-identical; the typed factory strips to the same logic".

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## What shipped (beyond the plan above)

- `getRT` lookups type the child's result over `any` inputs, `(v: any, ...rest: any[]) => <result>`: a body only
  holds `any` values, and a `never` input type would refuse them.
- Dead declarations: `Walker.ContextLines` keeps only the context items the body reaches (every mode). Map checks
  bind a key / value local only when the child code reads it; string length errors bind `codePointLength` lazily.
- A void root restore returns `undefined` instead of assigning to the parameter.
- Runtime type fixes the strict lane found: `code` optional in `FnTypeTuple`, `classType?: object` (a constructor
  type cost every builder call site 4 instantiations over its budget), `rels` rows may be `undefined`.
- Annotation is one parser pass, not per-emitter marks: `tsannotate.Function` runs over every typed factory
  (`typefunctions/module.go` `fnSlots`) as well as pure fns. Marks stay for the boundaries (signatures, lookups,
  casts). A coverage test (`TestAnnotate_EveryBindingKindHasARow`) gives every declaration kind a row.
- Strip parity (`packages/devtools/test/helpers/typedEmit.ts`) normalizes the by-design differences: `.ts`
  specifiers, `undefined` head slots, `_` prefixes and parenthesized lone arrow params, then whitespace. Factory
  parity is proven there (e2e + fuzz TE1), not by a Go `JsText` test: tsannotate's insertions are not marks.
  `TestTypedEmit_CodeSlotMatchesBoth` covers the code slot over one rich source instead of F1..F17.
- The e2e project has no `enum`: a user enum fails `erasableSyntaxOnly` and Node type stripping. Enums are
  covered by the type printer test (`TestTypeModulePrinter_DataOnly`, a literal union).
- `TestPrintersCoverRunType` needed no new row: the two flags add no RunType field.
- The `mion-pure-fns/` artifact ships the `both` twin in `ts` mode. `mion compile` in `ts` refuses, before
  generating, a missing outDir and an outDir that is the source root (each source would overwrite itself).
- Next: `container/pre-publish-e2e/apps/smoke-next-ts` builds the shared self check under Turbopack in `ts` mode.
- The strictest tsconfig needs `lib: ['ES2023', 'DOM']` (generated code reads `URL` and friends).
- Fuzz: the `typedemit` lane (`test/fuzz/type/typedEmitFuzz.ts`), rules TE1 strip parity, TE2 same verdict as
  `both`, TE3 one strictest tsc program per run. It found the dead-declaration, loose-family, lookup-input,
  predicate-rename and loop-variable fixes, each with its own Go test. Soak: `MION_FUZZ_TYPEDEMIT_SOAK_MS`.
- Docs that could go stale: the configuration page's Typed Output section, the vite and cli devtools pages,
  `.agents/docs/architecture.md`.

## Out of scope

- Referencing user declarations from generated code, including typed pure-fn source. Rejected: circular
  imports, unexported / local types, name clashes from structural dedupe.
- A printed JSON wire type (`J_<id>`): the JSON side is `unknown` by decision.
- Precise types INSIDE fn bodies (input stays `any`): the long tail per emitter arm, a later feature.
- The runtime's own `new Function` sites (`rtUtils.ts:246-255`) and other native-compiler ports of
  `@mionjs/run-types`: needs a real native target to test against.
- Public `createX` signatures built on `DataOnly<>` / `JSONShape<>`: unchanged public API.
- The bundled-api client mirror (forced `functions`, client only). Source maps for the `ts` compile tree.

## Done when

- `emitMode: 'ts'` works through the CLI flag, the tsconfig key and every bundler plugin.
  It writes `.ts` modules with `.ts` import paths, one `t/<typeId>.ts` per type id, and typed factories.
- The code slot is byte-identical to `both`. Strip parity holds. The strictest-tsconfig lane has 0 errors.
- `mion compile --emit-mode ts` writes a runnable TS tree, and `node main.ts` runs it.
- The `ts` vitest lane and the fuzz lane are green. All Go and JS tests above pass.
- The docs pages above are updated.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
