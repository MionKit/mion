---
type: feature
spec: full-plan
status: ready
created: 2026-08-08
---

# Format conversion layer: type ⇄ builders ⇄ JSON Schema (`convert` CLI)

## Problem / intent

RunTypes has three authoring forms — type-first, value-first builders (`RT.*`/`TF.*`), and JSON Schema (`runTypeFromJsonSchema`) — that all converge on one structural id. Today the convergence is one-directional: builders and schemas are *read into* a type; nothing can write a type *back out* as another form. We want a converter that takes any file and rewrites its type declarations into any of the three forms, with a hard guarantee: **conversion never changes the structural id or the emitted cache code**. Every type (including natives like Date/Map/bigint and nominal classes/enums) must survive a full round trip `type → builders → type → JSON Schema → type`.

## Locked decisions (from the design discussion)

1. **Hub-and-spoke over the reflection model.** Inputs already normalize to the `RunType` graph ([ts-go-runtypes/internal/reflection/runtype.go](../../ts-go-runtypes/internal/reflection/runtype.go)) via the checker; the new work is three *printers* (type / builder / schema) over that graph. Three printers cover all six directions.
2. **CLI-only surface.** A new `convert` verb on the binary (dispatch table `ts-go-runtypes/cmd/ts-runtypes/main.go:87`). NO serve/daemon op, no bundler integration — this is a one-shot migration tool that edits files in place by default. The input may be files/globs or a **directory**; with `--out-dir DIR` the input directory is copied wholesale into DIR (non-converted files and assets included, so relative imports stay valid) and every `.ts`/`.tsx` inside the COPY is converted, sources untouched. `--check` prints intended changes without writing (exit 1 if changes pending).
3. **The schema form becomes a complete SUPERSET dialect of 2020-12**: pure-data keywords for everything structural (standard keywords whenever exact, plus the `jsType` vendor vocabulary for JS/TS-only constructs), and ONE typed escape hatch — **`embedType`** — for what data cannot carry: references to nominal declarations (classes, enums) and to other named in-set types. Functions stay structural (parameters + return as nested schemas — no live code needed). The superset is a *projection* of the RunType model, never a replacement: the internal reflection model, wire and cache stay RunType (migrating them to a schema dialect would churn every emitter and id for zero user value — explicitly rejected). Anything genuinely unsupported (unresolved generic declarations, symbol identity) errors loudly.
4. **Label-capable builders ship as part of this feature** (existing ROADMAP item): tuple element labels and function parameter names are id-relevant, so builders (and the schema dialect) get a spelling for them.
5. **Cross-file named types:** converting a *set* of files is supported. A converted declaration referencing a named type declared in another file of the set gets its imports rewritten as if that file were already converted. A reference to a type **outside** the set is an **Error** (declaration skipped). Import management (add/remove/update) is fully in scope.
6. **Fidelity contract: id-exact AND information-lossless.** The structural id and the emitted cache modules are necessary but NOT sufficient — some information the reflection graph (or the source) carries does not fold into the id, and it must survive conversion too. Three tiers: (a) id-relevant data (structure, formats, sentinels, readonly — verified id-relevant at `ts-go-runtypes/internal/cachegen/runtype/typeid/typeid.go:685` — labels, `@nonEnumerable`) is caught by the id oracle; (b) graph-carried but possibly-not-id-folded data (names, defaults, descriptions, enum member names, class provenance) is caught by a new full-graph equality oracle (C6) plus the **no-info-loss inventory** section below; (c) source-only data (member JSDoc/comments, schema annotations) is carried through explicit mappings (JSDoc ↔ `description` etc., inventory below). Only true sugar normalizes: utility types expand, formatting/whitespace, member order preserved as declared.

## Architecture

### New Go package `ts-go-runtypes/internal/convert/`

The shared leaf (enrichment-pattern: one leaf, one CLI verb, no drift):

- `recognize.go` — walks a file's top-level statements and classifies convertible declarations: `type` aliases, `interface`s, and any `const` whose resolved type is the marker module's `RunType<T>` (covers builder consts AND `runTypeFromJsonSchema` consts uniformly — same by-return-type detection as `internal/compiler/builders`, never name matching). Also records each declaration's current form (for idempotence and for `InferType` alias pairing) and every import binding it owns.
- `resolve.go` — declaration → `RunType` graph + id, through the existing program/checker plumbing and the `internal/cachegen/runtype` projection (`serialize.go`) — the exact projection the resolver uses for marker sites, entered from a declaration's type instead of a call site.
- `names.go` — the id ↔ declaration-name table across the *whole converted set*: sibling/imported-in-set references print as references (builder: `bRT` const; type: the preserved `B` alias; schema: `embedType<B>()`, or inline `$defs` under `--portable`). Circulars route through it (`RT.circular`/`self()`, `$defs` + `$ref`, named alias). Collision policy: derived const names (`MyType` → `myTypeRT`) get numeric suffixes + Warning.
- `printtype.go` / `printbuilder.go` / `printschema.go` — pure functions `(RunType, names) → source text`. No checker access → unit-testable with goldens. Deterministic, stable formatting (multi-line objects, 2-space indent — users run their own formatter after).
- `imports.go` — per-file import edits: add what the output needs (`RT`, `TF`, `TFT`, `runTypeFromJsonSchema`, `InferType`, `embedType`), reuse existing aliases when the file already imports these modules, retarget in-set cross-file imports (`import {B} from './b'` → `import {bRT} from './b'` for value positions; type-position imports of `B` never change because every conversion keeps the `type B = …` name alive), remove only imports the converter manages that became fully unused.
- `edits.go` — declaration-span replacements assembled through the existing `EditBuffer` (`internal/compiler/sourcerewrite`), applied and written to disk by the CLI.

### CLI verb

```
ts-runtypes convert --to type|builders|json-schema [--check] [--portable] [--out-dir DIR] <files|dir...>
```

- The arguments are the conversion set: files/globs (shell-resolved) or a directory (all `.ts`/`.tsx` under it, recursively). The program/tsconfig loads as in the other verbs (shared knobs apply).
- `--out-dir DIR`: copy the input directory into DIR first (full copy — assets and non-converted files ride along so relative imports keep resolving), then convert the `.ts`/`.tsx` files inside the copy; the source tree is untouched. Without it, conversion is in place.
- Per-declaration failures are diagnostics, not aborts: convert what's convertible, report the rest, exit non-zero if any Error was raised.
- `--portable` (schema target only): forbid the dialect — vendor keywords and `embedType` — so any node that would need them becomes an Error. For users who want pure interchange 2020-12.
- Idempotence: converting a file already in the target form is a byte no-op.

### Conversion semantics per direction

- **→ builders / → json-schema:** the declaration is replaced by `const myTypeRT = …` **plus** `type MyType = InferType<typeof myTypeRT>`, so every existing type-position use (`createValidateFn<MyType>()`, annotations, other files' `import type`) keeps compiling with zero call-site edits.
- **→ type:** the const disappears. Marker call sites that passed the const as a value (`createValidateFn(myTypeRT)`) are known to the resolver and rewrite mechanically to `createValidateFn<MyType>()`. A non-marker value use of the const (passing the runtype around as data) is an Error → that declaration is skipped.
- **Schema `$defs` / references both ways:** printing to schema, a reference to another named in-set declaration prints as `embedType<B>()` (mirrors the builder target's `bRT` reference — files stay DRY, source organization survives); self/mutual recursion WITHIN one declaration prints `$defs` + `$ref` (the proven M6 path; cross-document `$ref` stays rejected). Under `--portable`, embeds are forbidden, so named references inline as `$defs` entries instead (fully self-contained standard documents; Error where inexpressible). Reading FROM schema (`--to type|builders`), a `$defs` entry referenced more than once or circular is **hoisted to its own sibling declaration** named after the `$defs` key; single-use non-circular entries inline.
- **Class/enum references:** never converted themselves (they are runtime code); converted types *reference* them. Builder: `RT.classType(MyClass)` / `RT.enum(MyEnum)`. Schema: `embedType<MyClass>()` / `embedType<MyEnum>()` (the escape below). Imports for the referenced names are managed like any other.
- **Generic declarations** (`type Box<T>`) are skipped with a diagnostic in every target (no spelling for an unbound parameter). Generic *instantiations* (`Box<number>`) inline their expanded structure with a Warning.

## The schema superset dialect (pure-data keywords + the `embedType` escape)

**Why superset-first, and where `embedType` fits.** Pure-data keywords keep documents JSON-serializable — storable as `.json`, diffable, machine-processable, and a future `createJsonSchemaFn` can emit the same dialect, making schema a lossless interchange projection of the type system. `embedType` complements them where data is impossible (a live constructor can never be JSON) and as a hand-authoring convenience: one door rule (substitute `T` verbatim), lighter on tsc than keyword recursion (embedded subtrees skip the door entirely), trivially id-exact. Division of labor for the printer: **keywords for everything structural, `embedType` only for class/enum references and named in-set type references.** Sequencing bonus: with `embedType` shipped in phase 1, every kind can round-trip immediately, and keyword rows land phase-by-phase as pure-data refinements (the printer switches from escape to keyword as each row ships; the fuzz census tracks remaining escape usage).

Standard keywords are used whenever they map exactly (that's most of the surface — proven by the existing jsonschema convergence fuzz lane). The dialect adds, all recognized by `JsonSchemaInput` + `ExactJsonSchema` (`packages/ts-runtypes/src/json-schema/fromJsonSchema.ts:89` / `:216`) and mapped by `FromJsonSchema`:

| Keyword | Payload | Covers |
| --- | --- | --- |
| `jsType` | `'Date' \| 'RegExp' \| 'Map' \| 'Set' \| 'Promise' \| 'bigint' \| 'symbol' \| 'undefined' \| 'void' \| 'any' \| 'object' \| 'function' \| 'templateLiteral' \| 'Temporal.Instant' \| … (all 8 Temporal)` | the discriminator for every structural JS/TS construct 2020-12 cannot spell (nominals go through `embedType` instead) |
| `typeArguments` | `readonly Schema[]` | `Map<K,V>` / `Set<T>` / `Promise<T>` (mirrors the RunType `arguments`/`typeArguments` slots) |
| `parameters` / `returns` | `readonly Schema[]` / `Schema` | `jsType: 'function'` signatures (structural — methodSignature and function-typed properties share it) |
| `jsLabels` | `readonly string[]` | tuple element labels (beside `prefixItems`) and function parameter names (beside `parameters`) — id-relevant |
| `jsReadonly` | `true` | readonly property modifier, **lifting** (standard `readOnly` stays annotation-only — that deliberate finish-line decision is untouched; the dialect keyword is the exact carrier) |
| `jsNonEnumerable` | `true` | the `@nonEnumerable` JSDoc-tagged property descriptor (id-relevant via `typeid.IsNonEnumerable` but JSDoc-carried today — this keyword plus a `propMod` option give it builder/schema spellings for the first time) |
| `jsIndexKeys` | `'number' \| 'symbol'` | non-string index signatures (string index sigs keep standard `additionalProperties`) |
| `jsFormat` | `{name: FormatName, params?}` | any format brand with no exact standard keyword (bigint/number/currency formats, param sets beyond standard) — `FormatName` is the generated union in `packages/ts-runtypes/src/go-generated/typeFormats.generated.ts` |
| `jsMeta` | `readonly Schema[]` | opaque `typeMeta` brands (`string & {__brand: 'X'}`), append semantics like the sentinels |
| `const` beside `jsType` | encoded literal | bigint literals (digit string), regexp literals (`{source, flags}`), symbol literals (description) — same encodings the JSON wire already uses |

**The `embedType` escape.** `embedType<T>(): EmbedSchema<T>` (type-first) / `embedType(value)` (value-first, `T` inferred — `embedType(MyClass)` embeds the instance type via `InstanceType<typeof MyClass>`) is legal at every schema position. The returned value is runtime-inert (a tiny `{__rtEmbed: true}` placeholder); its TYPE carries `T`, and `FromJsonSchema` substitutes `T` verbatim at that node — one door rule, no per-feature lowering, trivially id-exact. Declared in the marker module so the Go scanner accepts it as a `CompTimeArgs` leaf by return type (same `DeclaredInModule` + return-type detection as the builders — small addition beside `IsBuilderLeafCall` in `internal/compiler/builders`). Both call shapes are covered under the marker-coverage test rule. Hand-authors may use it anywhere as a convenience (fuzz pins that an embedded subtree and its keyword spelling converge on one id); `--portable` forbids it like every dialect extension. Exact public name TBD at impl (`embedType` vs the discussed `extendSchema`).

**Lowering rule (design invariant preserved):** the resolver still never sees a schema. Every dialect keyword lowers type-level to an existing or new sentinel the intersection collapse lifts — notably `jsLabels` lowers to a new `__rtLabels` sentinel (a literal string tuple) that the lift writes into `TupleMember`/`Parameter.Name`, the SAME mechanism the label-capable builders use. New sentinel slots wire into `eachRefSlot` (`internal/reflection/refslots.go`) per its contract.

## Per-feature mapping — every supported JSON-Schema feature → plan action

Columns: what the printer emits for each target, and door work if any. "params bag" = the trailing options of `RT.array`/`RT.object`/`RT.record`; brands = `TF.*`/`FormattedArray`/`FormattedObject` types.

### Core structure

| Feature | → type | → builders | → schema | Door work |
| --- | --- | --- | --- | --- |
| `type` (7 names, incl. array-of-names) | primitive / union | `TF.string()` etc. / `RT.union` | `type` (array form only printed when a plain multi-primitive union) | none |
| `properties` + `required` | object members, `?` inversion | `RT.object({…})` + `optional()` | `properties` + `required` | none |
| `additionalProperties: false` | closed shape (derived) | object closedness param | `additionalProperties: false` | none |
| `additionalProperties: <schema>` | string index signature (mixed form keeps exact index type) | `RT.record` / object + index member | `additionalProperties` | none |
| `patternProperties` | `FormattedObject` patternProperties slot | params bag `patternProperties` | `patternProperties` | none |
| `propertyNames` | `FormattedObject` propertyNames | params bag `propertyNames` | `propertyNames` (one entry per stacked check — append list semantics preserved) | none |
| `minProperties`/`maxProperties` | `FormattedObject` params | params bag | keywords | none |
| `items` / `prefixItems` / `items: false` / boolean slots | `T[]` / tuple / closed tuple | `RT.array` / `RT.tuple` | `items`/`prefixItems` (+ `true` padding / `false` slots preserved semantically) | none |
| `minItems`/`maxItems`/`uniqueItems` | `FormattedArray` params (bare `minItems` three-mode rule respected) | params bag | keywords | none |
| `contains`/`minContains`/`maxContains` | contains slot on the array brand | params bag `contains` | keywords | none |
| `enum` / `const` | literal union / literal | `RT.union(RT.literal(…))` / `RT.literal` | `enum` / `const` | none |
| `anyOf` | union | `RT.anyOf`/`RT.union` | `anyOf` | none |
| `oneOf` | `OneOf<[…]>` | `RT.oneOf` | `oneOf` (read off the `SchemaChecks.OneOf` branch list, which preserves grouping) | none |
| `allOf` | intersection | `RT.intersection` | printed only when the graph retains an intersection; collapsed input prints its collapsed form (normalization, id-exact) | none |
| `not` | `Not<F>` / `__rtNot` spelling | `RT.not` | `not` (one per Negations entry) | none |
| `if`/`then`/`else`, `dependentRequired`, `dependentSchemas` | desugared union form | `RT.conditional` / `RT.dependentRequired` / `RT.dependentSchemas` where the pre-desugar shape is recoverable; otherwise the desugared union | **printed desugared** (input desugars through the distributive conjunction; the pre-desugar document is not retained — document this as accepted normalization) | none |
| `unevaluatedProperties`/`unevaluatedItems` | same base type; metadata sentinel | params bag (verify exact key on `FormattedObjectParamsValueFirst`) | reconstructed from `SchemaChecks.Unevaluated` (keys/sources/groups → the keyword + its scope) | none |
| `$defs`/`$ref` (`#`, `#/$defs/x`, `$anchor`/`$dynamicAnchor`/`$dynamicRef`) | hoisted named decls (multi-use/circular) or inline | same, via `RT.circular`/`self()` for cycles | `$defs` + `$ref` only (anchors normalize to pointer refs on the way in; printer never emits anchors) | none |
| Boolean subschemas | `unknown` / `never` | `RT.unknown()` / `RT.never()` | `true` / `false` at legal positions | none |

### Strings, numbers, content

| Feature | → type / → builders | → schema | Door work |
| --- | --- | --- | --- |
| `format` (every enforced keyword row) | the matching `TF.*` brand (mirror table pinned against `FormatName`) | the standard `format` keyword | none |
| unknown `format` values (annotation per spec) | base string (Warning: annotation dropped) | not reproduced | none |
| `minLength`/`maxLength`/`pattern` | `TF.string({…})` | keywords | none |
| `minimum`/`maximum`/`exclusive*`/`multipleOf`/`integer` | `TF.number({…})` / integer format | keywords | none |
| `contentEncoding` (base64/base32/base16), `contentMediaType: application/json` | `TF` content brands (Base64/JsonContent/…) | keywords | none |
| Any other format annotation (number/bigint/currency/date-time param sets, structural extras with no exact keyword) | the exact `TF.*` builder from `FormatAnnotation.name+params` | `jsFormat: {name, params}` | accept `jsFormat` → brand |

### JS/TS constructs (the "every type round-trips" half)

| Feature | → type | → builders | → schema | Door work |
| --- | --- | --- | --- | --- |
| `Date`, `RegExp`, Temporal (8) | the native name | `TF.date()` / `RT.regexp()` / `TFT.*` | `{jsType: '<Name>'}` (+ standard-expressible bound params as siblings, else `jsFormat`) | accept `jsType` rows |
| `Map`/`Set`/`Promise` | `Map<K,V>` etc. | `RT.map`/`RT.set`/`RT.promise` | `{jsType, typeArguments}` | accept + recurse |
| `bigint` (+ literals) | `bigint` / `123n` | `TF.bigInt()` / `RT.literal(123n)` | `{jsType: 'bigint'}` (+ `const: '123'`) | accept |
| `symbol`, `undefined`, `void`, `any` | keywords | `RT.symbol()` etc. | `{jsType: …}` (`unknown` stays standard `{}`/`true`, `never` stays `{enum: []}`, `null` stays standard) | accept |
| function / method / callable signatures | fn type / method member | `RT.func`/`RT.callable` | `{jsType: 'function', parameters, returns, jsLabels}` | accept, build structurally |
| classes (incl. generic instantiations) | class name reference | `RT.classType(MyClass)` | `embedType<MyClass>()` (generic instantiations embed the instantiated type) | embed substitution (`InstanceType` on constructor types for the value shape) |
| TS enums | enum name | `RT.enum(MyEnum)` | `embedType<MyEnum>()` | embed substitution — the type-arg shape carries the nominal enum type directly; the value shape `embedType(MyEnum)` needs the member-union recovery (spike) |
| named in-set type references | keep the name | sibling/imported `bRT` const | `embedType<B>()` (inline `$defs` under `--portable`) | embed substitution |
| template literal types | the template type | `RT.templateLiteral` | `{jsType: 'templateLiteral', parts: […]}` | reassemble via `AssembleTemplate` (`builders/static.ts`) |
| tuple labels / param names | labeled syntax | label-capable builders (below) | `jsLabels` | `__rtLabels` sentinel lift (shared) |
| readonly property modifier | `readonly` syntax | `propMod({readonly: true}, …)` | `jsReadonly: true` | lift `jsReadonly` (id-relevant, `typeid.go:685`) |
| `@nonEnumerable` property descriptor | the JSDoc tag | `propMod({nonEnumerable: true}, …)` (new option) | `jsNonEnumerable: true` | new lift + builder option (id-relevant already; the spellings are the new part) |
| number/symbol index signatures | index sig syntax | record/object forms | `jsIndexKeys` | accept |
| `typeMeta` brands | the intersection | type-channel intersection (builder composes via its brand arg) | `jsMeta` | accept → intersection |
| symbol-keyed members (`@@name`, structural-brand keys) | native syntax | native syntax via type channel | `properties` keys spelled `@@name` + flag (proposed; verify at impl) | accept |

### Annotations & rejections

| Feature | Action |
| --- | --- |
| `description` / `title` / `default` / `examples` / `deprecated` | **Carried, not dropped** — mapped to member JSDoc both ways (`description` ↔ the JSDoc text; `title` ↔ `@title`, `default` ↔ `@default`, `examples` ↔ `@example`, `deprecated` ↔ `@deprecated`). Rides the `RunType.Description` field (`internal/reflection/runtype.go:319`, reserved for exactly this — the projection starts populating it from JSDoc trivia). See the no-info-loss inventory below. |
| `$comment` / `readOnly` / `writeOnly` | Dropped on conversion with a Warning (aligned with the `json-schema-dropped-intent` lint; `readOnly`-as-annotation is the deliberate finish-line decision — the exact modifier travels as `jsReadonly`). Root `$id`/`$schema`/`$vocabulary` likewise not reproduced. |
| embedded `$id`, `contentSchema`, cross-document refs, other encodings/media types, draft-07 | Remain rejected on input; the printer can never produce them. |
| `SafeUnionChildren`/`UnionDiscriminators`/`Overrides`/`NotSupported` | Derived or runtime-registered data — printers ignore (recomputed on the next resolve). |

## Beyond the id — the no-info-loss inventory

The id oracle cannot catch data the structural id does not fold. This inventory lists every such slot with its conversion action; the C6 graph-equality oracle (Fuzzing) plus per-slot goldens enforce it. First implementation task of phase 0: **audit the `typeid` fold against the `RunType` struct field-by-field** and extend this inventory with anything found (each row gets a golden that C6 catches).

| Not (fully) in the id | Where it lives | Conversion action |
| --- | --- | --- |
| Member JSDoc / comments | source trivia; `RunType.Description` reserved (`runtype.go:319`) | Populate `Description` from JSDoc in the projection. Printers emit it: type/builder targets as a JSDoc comment on the member (recognition reads builder-config comment trivia back), schema target as `description`. No silent drop. |
| Schema annotations (`description`/`title`/`default`/`examples`/`deprecated`) | schema literal only | JSDoc tag mappings (table above) riding the same `Description` channel. |
| Declaration names (`TypeName`) | declarations | The names table: preserved via the kept aliases / const names / `$defs` keys / `embedType<B>()` references. |
| Literal parameter/property defaults (`DefaultVal`, `flags: ["nonLiteralDefault"]`) | reflection graph | Verify id-relevance in the audit; printers carry literal defaults where the target has a spelling, Warning where only the non-literal flag survives. (Rarely reachable from convertible declarations — type positions carry no defaults — but the audit decides, not assumption.) |
| Enum member NAMES (`EnumVal` keys) | reflection graph | Enums are referenced nominally (`RT.enum(MyEnum)` / `embedType<MyEnum>()`), never inlined — names survive by construction. |
| Class provenance (`ClassRef` name/module) | reflection graph | Classes referenced nominally, imports managed — survives by construction. |
| Derived slots (`SafeUnionChildren`, `UnionDiscriminators`, `IsCircular`, `Family`, `NotSupported`) | computed at serialize time | No action — recomputed identically on the next resolve; C6 compares post-serialization graphs so they must still match. |

## Label-capable builders (bundled sub-project)

- Surface: labels on `RT.tuple` (e.g. per-slot wrapper or a `labels` entry in a params position — final spelling decided at impl; must be literal, `CompTimeArgs`-scanned) and parameter names on `RT.func`/`RT.callable`.
- Mechanism: the builder's returned type attaches a `__rtLabels` sentinel (literal string tuple) exactly like the other sentinel slots; the intersection collapse lifts it into `TupleMember.Name`/`Parameter.Name`, which already fold into the id. The schema dialect's `jsLabels` lowers to the same sentinel — one lift, three doors.
- Restores type↔builder convergence for labeled shapes; update the pinned divergence in `packages/ts-runtypes/test/features/callableBuilder.test.ts` to a convergence pin.

## Diagnostics

New `CNV` family in `internal/diagnostics` (+ `gen-diag-catalog` regen): Errors — reference outside the conversion set; non-convertible declaration for the target (`--portable` dialect need, unresolved generic decl, non-marker value use of a converted const); unresolvable name collision. Warnings — non-mappable annotations dropped (`$comment`/`readOnly`/`writeOnly`); generic instantiation inlined; derived-name collision suffix. CLI exit non-zero iff any Error.

## Tests

- **Per-kind pinned goldens** (Go, `internal/convert/testdata/`): for every RunType kind/feature and every target, input `.ts` → expected `.ts`, in the ladder order atomic → array/tuple → object → union → circular → native → schema keywords — including JSDoc/`description` carriage cases and one golden per no-info-loss inventory row. Golden dirs excluded from `pnpm run format` scope like the other testdata.
- **CLI e2e** (JS, alongside the devtools binary-spawning helpers): run `convert` over a small multi-file fixture project; assert output files, import rewiring, `--check` behavior, `--out-dir` copy mode (sources untouched, copy converted, assets carried), `.tsx` handling, idempotence, exit codes.
- **Marker coverage rule:** fixture projects include both `getRunTypeId<T>()` and `getRunTypeId(value)` call shapes (and both `embedType` shapes) and assert both still resolve identically after conversion.
- **Door tests** for each dialect keyword (`packages/ts-runtypes/test/suites/json-schema-define/` pattern) + the official-suite lanes stay untouched (standard schemas never carry the dialect).
- Label convergence pins (tuple + func, both directions).

## Fuzzing

New `convert` lane under `packages/ts-runtypes/test/fuzz/convert/`, registered in `scripts/rt.mjs` (`pnpm rtx core fuzz convert [--soak]`), reusing `core/typeGen.ts` + the type-fuzz harness and driving the real CLI on a temp project per iteration:

- **C1** conversion is total: CLI never crashes; every output compiles (in-process `tsValidate` gate).
- **C2** id preserved on every leg (compile each printed form through the real pipeline).
- **C3** emitted cache modules byte-equal across legs.
- **C4** full chain `type → builders → type → schema → type` converges to the original id — schema legs cover the FULL space via the dialect; `--portable` legs cover the standard-expressible subset with a pinned coverage census so it can't silently shrink.
- **C5** printed output stable: convert(convert(x)) is byte-identical.
- **C6** no info loss beyond the id: the full serialized reflection graph (the resolver `dump` of each leg, refs re-knotted, derived slots included) is deep-equal across all legs — this catches every slot the id does not fold (the inventory above), including `Description` carriage.

The existing `jsonschema` convergence lane stays (it pins door-side format-leaf coverage); this lane subsumes its idea, adds the builder leg, and doubles as the drift test between the Go schema printer and the TS type-level door (independent implementations of one mapping). Consolidation is a later follow-up.

## Docs

- Website: new guide page under `container/website/content/` ("Converting between the three forms": command, targets, the dialect keywords, `embedType`, `--portable`, what normalizes), examples as `<code-import>` files in `packages/examples/src/`.
- `docs/ARCHITECTURE.md`: the `convert` verb + printers section; `docs/ROADMAP.md`: status row (and strike the labels open question); `docs/FUZZING.md`: the new lane row. Package READMEs untouched (thin-README rule).

## Phases

0. Scaffolding: `internal/convert` skeleton, recognition + resolution, `convert` verb + flags (incl. `--out-dir` copy mode), EditBuffer/import wiring, `CNV` catalog, golden harness, fuzz-lane skeleton (atomic space); **the typeid-fold-vs-RunType audit** that finalizes the no-info-loss inventory.
1. Atomic + formats + **the `embedType` escape** (both call shapes, `ExactJsonSchema` acceptance, door substitution, Go leaf recognition — from here every kind can round-trip via embed while keyword rows ratchet in): scalars, literals, null/undefined/any/unknown/never/void, every `TF.*` brand ↔ standard keyword ↔ `jsFormat`; first `jsType` rows (bigint/symbol/undefined/void/any) land in the door.
2. Arrays + tuples + structural params; **label-capable builders + `__rtLabels` lift + `jsLabels`**.
3. Objects: optional/readonly (`jsReadonly`), `@nonEnumerable` spellings (`propMod` option + `jsNonEnumerable`), member JSDoc/`description` carriage (`Description` population + printer/recognition trivia), index signatures (`jsIndexKeys`), records, patternProperties/propertyNames, key counts, closedness, `jsMeta`, symbol-keyed members.
4. Unions/intersections/enums (via `embedType`)/oneOf/anyOf/not.
5. Circulars: `RT.circular`/`self()`, `$defs`/`$ref` both directions, hoisting rules, embedded cross-references, cross-file set handling end-to-end.
6. Natives: Date/RegExp/Map/Set/Promise/Temporal (`jsType` + `typeArguments`), classes via `embedType`, function/method/callable signatures.
7. Schema tail: conditionals/dependents (desugared print), `unevaluated*` reconstruction, content keywords, boolean subschemas, template literals.
8. Ship gate: website + examples + ARCHITECTURE/ROADMAP/FUZZING updates, fuzz soak green, full-chain oracle in CI.

Each phase = the three printers for those kinds + door rows + goldens + fuzz-space widening, so coverage ratchets monotonically.

## Verify-early spikes (before their phase lands)

1. `embedType` end-to-end: `EmbedSchema<T>` accepted by `ExactJsonSchema` at every schema position without breaking `const` inference; `FromJsonSchema` substitution; Go leaf recognition by return type; the injected-id path unaffected.
2. Mutual recursion via embedded cross-references (`A` embeds `B`, `B` embeds `A`, each behind its own `InferType` alias) ties a legal cycle without hitting the TS2589 instantiation wall. Fallback if not: hoist the cycle into one declaration's `$defs` group.
3. Enum value-shape recovery: does `(typeof E)[keyof typeof E]` project to the same `KindEnum` id as `E`? (Type-arg shape needs no trick; this only gates `embedType(MyEnum)`.)
4. `{enum: []}` → `never`, `{}`/`true` → `unknown`, `{type: 'object'}` recovery — confirm the exact standard spellings the printers must emit for the top/bottom/object kinds.
5. Template-literal reassembly from `parts` via `AssembleTemplate` at arbitrary nesting.
6. `Description` carriage: populate `RunType.Description` from JSDoc trivia in the projection without disturbing ids or the disk cache fingerprint, and read comment trivia back off builder-config members during recognition.

## Out of scope

- Serve/daemon `convert` op or bundler-plugin integration (CLI only; revisit only if fuzz soak throughput forces an internal test lane).
- Watch mode.
- `createJsonSchemaFn<T>()` runtime factory (separate parked feature; the schema printer is written as a reusable leaf so that feature can later call it).
- Draft-07; symbol identity; the non-mappable annotation trio (`$comment`/`readOnly`/`writeOnly` — dropped with a Warning, everything else carries per the inventory).
- Migrating the internal RunType reflection model / wire / cache to the schema dialect — rejected: the superset dialect is a projection of RunType, not a replacement (every emitter, id and cache entry keys on the RunType model; a model migration churns all of it for zero user value).

## Done when

- `ts-runtypes convert --to <target>` rewrites real multi-file projects between all three forms with imports fully managed, in-place, idempotent, `--check` accurate.
- Every RunType kind/feature has a pinned golden per target; every supported JSON-Schema feature has its mapped action implemented (tables above); the superset dialect is complete (every kind has a pure-data keyword spelling or the documented `embedType` escape) and the door accepts all of it with the official-suite lanes untouched.
- Label-capable builders shipped; labeled shapes converge across all three forms.
- The `convert` fuzz lane (C1–C6) is green including soak: full-chain id + emitted-module + reflection-graph equality over the full generated space, `--portable` subset censused.
- The no-info-loss inventory is audit-complete (typeid fold vs `RunType` field-by-field) with a golden per row; member JSDoc and the mappable schema annotations round-trip.
- Docs shipped (website guide + examples + ARCHITECTURE/ROADMAP/FUZZING).
