---
type: fix
spec: full-plan
status: shipped
created: 2026-09-21
---

# An undeclared key reaches the handler when a union carries a record member

## Problem, as it was before this change

Every path and option name below is the code as found. What replaced it is under "What shipped".

A route accepts a payload carrying a key no member of the param type declares, and hands it to the
handler untouched, whenever the param type is a union with an index-signature member. No error is
raised, on any strategy, with `strictTypes` on.

```ts
type Something = {a: string} | Record<string, number>;
```

```
payload {a: 'x', evil: 'garbage'}          strictTypes: true

clone (default)   handler receives {a: 'x', evil: 'garbage'}    no error
mutate            handler receives {a: 'x', evil: 'garbage'}    no error
{a: string}       handler receives {a: 'x'}                     (control, key dropped)
```

`evil` holds a string where the record says number, so the value matches no member of the union.
Nothing checks it, at any depth, and the handler is typed as if it could not be there.

### How decode and validate interact, and where the hole opens

The library's safety story is two steps: **the decoder removes undeclared keys, then validate checks
what is left.** Each step is sound alone. The hole is in what each assumes about the other.

**Step one, the decoder.** It removes a key belonging to NO member, and keeps a key belonging to ANY
member, because it pools every member's property names into one list. It never validates, so it
cannot know which member matched.

```
Pet = {kind: 'cat'; meows: boolean} | {kind: 'dog'; barks: number}

{kind:'cat', meows:true, zzz:9}      → decode strip → {kind:'cat', meows:true}              zzz dropped
{kind:'cat', meows:true, barks:3}    → decode strip → {kind:'cat', meows:true, barks:3}     barks KEPT
{a:'x'} | {b:number},  {a:'x', b:1}  → decode strip → {a:'x', b:1}                          b KEPT
{pet: {kind:'cat', meows:true, barks:3}}  (nested)  → barks KEPT
```

**Step two, validate.** It matches the value against the union's OR chain and stops at the first
member that fits. `{kind:'cat', meows:true, barks:3}` fits `Cat` under the loose reading, so validate
says yes. It never asks whether `barks` belongs to the member that matched.

So a sibling member's key survives both steps, on **every** union, record or not.

**The record member makes it total.** When any member carries an index signature, the unknown-key
families emit nothing at all, for the whole subtree:

```js
// generated today for {a: string} | Record<string, number>
hasUnknownKeys  →  () => false          // a constant
encodeClone     →  JSON.stringify(v)    // keeps every key
```

The carve-out is at `ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_union.go:35`, with
the same guard in `union_flat.go:482`, `json_prepare_clone.go:768` and `json_restore_clone.go:268`:

```go
// Index-sig carve-out: the value might match the indexed branch, where every key is declared via the pattern.
if layout.hasIndexSignatureMember(ctx) {
    return RTCode{Code: "", Type: opts.CodeShape}
}
```

It is correct on its own terms. A value matching the record member really does declare every key, and
a codec never validates, so it cannot tell that case from the other one. The consequence is that step
one stops removing anything, and step two was never going to catch it.

**The router then assumed step one did its job.** In what was `router/src/types/serializer.ts`:

```ts
/** `mutate` alone keeps undeclared keys: every other params decoder rebuilds the declared shape, so the
 *  key is gone before the check runs. */
type UnknownKeys<Strategy, Key> = Strategy extends 'mutate' ? Key : never;
```

On `clone` and `compact` the unknown-key check is never compiled. The comment's premise fails for a
record union, so `strictTypes` on those strategies has nothing to check. On `mutate` it is compiled
but answers `false` for every value.

### Why the families cannot all agree

This is the part to write down, because it looks like a bug and is not.

`hasUnknownKeys` and the codecs answer **"is any key declared by no member"**. On a record union the
honest answer is always no: the record declares every key. Making them answer **"is any key declared
by the member that actually matched"** would mean running validation inside every encoder, decoder
and clone. That is a different function with a different cost, and the split walk is why the compiled
codecs are fast.

So the two questions stay two questions. The families that answer the second one are the fused
validators, and they are the only ones correct on every shape:

| type | value | decode strip | validate | validate + has | `{checkUnknowns}` |
| --- | --- | --- | --- | --- | --- |
| `{a:string} \| Record<string,number>` | `{a:'x', evil:'garbage'}` | kept | true | true | **false** |
| `{a:string} \| Record<string,number>` | `{a:'x', evil:1}` | kept | true | true | **false** |
| `{a:string} \| Record<string,number>` | `{p:1, q:2}` | kept | true | true | true |
| `{a:string} \| Record<string,string>` | `{a:'x', evil:'garbage'}` | kept | true | true | true, it IS a record |
| `{a:string} \| Record<string,string>` | `{a:'x', evil:1}` | kept | true | true | **false** |
| `{a:number} \| Record<string,number>` | `{a:1, evil:'s'}` | kept | true | true | **false** |
| `{a:string;b:number} \| Record<string,number>` | `{a:'x', b:1, evil:2}` | kept | true | true | **false** |
| `{kind:'cat';meows:boolean} \| Record<string,number>` | `{kind:'cat', meows:true, evil:2}` | kept | true | true | **false** |
| `{a:string} \| Record<string,unknown>` | any object | kept | true | true | true, correct |
| `{a:string} \| {b:number}` | `{a:'x', evil:'garbage'}` | **stripped** | true | false | false |
| `{a:string}` | `{a:'x', evil:'garbage'}` | **stripped** | true | false | false |

Measured. The fused validator is right on every row, and it is never looser than the two-step
composition on any shape.

`hasUnknownKeys` also goes blind for the whole subtree, not just the union's own keys:

```ts
type RecUnion = {a: {x: string}} | Record<string, number>;
const value = {a: {x: 'v', evil: 1}};   // evil sits on a PLAIN object nested inside a member

validate                 = true
hasUnknownKeys           = false     // source is () => false
hasUnknownKeys@after     = false
validate{checkUnknowns}  = false     // only this one
```

That is why a strict router strategy must be built on the fused validator, not on `hasUnknownKeys`.

### Speed is not the deciding factor

Best of three rounds, 500k iterations, Node 26:

```
Small {a: string; b: number}
  validate + hasUnknownKeys{runsAfterValidation}     8.9 ns/op
  validate {checkUnknowns}                           7.9 ns/op

Big: 7 props, nested object, array
  validate + hasUnknownKeys{runsAfterValidation}    18.5 ns/op
  validate {checkUnknowns}                          19.6 ns/op

Union of two discriminated members
  validate + hasUnknownKeys{runsAfterValidation}     9.0 ns/op
  validate {checkUnknowns}                           8.4 ns/op
```

Within noise of each other. Correctness decides, and the fused validator wins outright. For
reference, what a `mutate` route runs today is the unoptimised pair at 44.8 ns/op, because it uses
the plain `hasUnknownKeys` rather than the `runsAfterValidation` variant.

### The return side leaks, and that is accepted

A handler returning such a union writes every own property to the wire, because its encoder is
`JSON.stringify(v)`:

```
encode({a: 'public', passwordHash: 'SECRET'})  →  {"a":"public","passwordHash":"SECRET"}
```

Returns were not validated at all: `validateReturn` was written into every method and never read.
That is fixed here, see "The return validator" below. It stays OFF by default, because a handler is
the application's own code.

---


## What shipped, Part 1 — two new compiled families

`validateUnionKeys` (tag `vuk`) and `validationErrorsUnionKeys` (tag `veuk`), reached from
`createValidateFn({checkUnionUnknowns: true})` and its errors twin. The option defaults to **false**,
so `createValidateFn<T>()` keeps its exact body, its fnHashes and its whole disk cache.

### Where the check is spliced

Not in the object arm, where `validateStrict` puts its check. A named union member is dep-called into
its own entry (every compound goes external past depth 1), and at that entry's own root it no longer
knows it sits under a union, so `ParentIsUnion` is false there.

It goes in `emitUnionValidate` (`typefunctions/validate.go`), which holds the resolved member whether
the arm is an inline body or a dep call:

```go
if checkMemberKeys {
    if assertion := unionMemberKeyAssertion(resolved, ctx); assertion != "" {
        childCode = "(" + childCode + " && " + assertion + ")"
    }
}
```

Appended LAST in the arm, which is what makes `strictObjectKeyAssertion`'s O(1) key-count compare
sound: every declared property was just verified present by the expression to its left.

The new file is `typefunctions/validate_union_keys.go`: the `UnionMemberKeys` marker interface, the two
emitters, `unionChecksMemberKeys`, `unionMemberBearsKeys` and `unionMemberKeyAssertion`.
`emitsUnknownKeyCheck` was split so its family-independent half (`nodeTakesUnknownKeyCheck`) is shared,
and `objectCallSignatureChild` was lifted out of `emitObjectValidate` into `unknownkeys_shared.go`.

### When the check runs

Only on a union with **two or more key-bearing members**, counted over the same child list the arms are
emitted from:

| resolved kind | counts | takes an assertion |
| --- | --- | --- |
| `KindObjectLiteral` with no index-signature child | yes | yes |
| `KindObjectLiteral` with one (a record) | yes | no, it declares every key |
| `KindIndexSignature` | yes | no, same reason |
| `KindClass`, `SubKindNone` | yes | yes |
| `KindClass` + Date / Map / Set / Temporal | no | no |
| array, tuple, atomics | no | no |

Below two, nothing is appended and the emitted body is byte-identical to plain `validate`'s. Asserted
both ways: in Go by rendering the same dump under both families and comparing the text with the family
hash blanked, and in TypeScript by comparing the two entries' code.

### Precedence

`checkUnknowns` wins when both are set, being strictly stronger. Read in the scanner by
`extractBoolValidateOption` (generalized from the old `checkUnknowns`-only reader) and applied by
`validatorFamilyOperation`, which replaced `checkUnknownsOperation`.

### The hand edits

Go: a `CacheModules` row per family, an operations registry row per family, the new emitter file, the
`ChecksUnionMemberKeys` predicate on `EmitContext`, the splice in `emitUnionValidate`, the delegate swap
in `emitUnionValidationErrors`, two `families.go` rows before the last, and the scanner's option reader
and family swap.

TypeScript: the `ValidateOptions.checkUnionUnknowns` field, two `RTFunctionByKey` rows, two `familyMeta`
rows. Then `pnpm miondevx core codegen all`.

Counts that had to move: `families_test.go` 23 → 25, and `fnhash_test.go`'s canonical key count +64
(two families × 32 variants). **No fnHash collision**, so `FnHashLen` stayed at 4.

---

## What shipped, Part 2 — the router runs one validator, the strategy says which

```
clone          decoder strips + validate {checkUnionUnknowns: true}
compact        decoder strips + validate {checkUnionUnknowns: true}
mutate         nothing stripped, plain validate
mutateStrict   validate {checkUnknowns: true}
```

The router never requests `hasUnknownKeys` or `unknownKeyErrors` again. They stay public standalone
APIs; the two optional fields that carried them on `JitCompiledFunctions` are gone, along with
`unknownKeysEntries` in the adapter.

### The rename

`serializer` → `parser`, in one commit ahead of the behaviour change, across the strategy identifiers,
the two module files, three example files and the Go mirror. The option key string lives at exactly one
non-test place in Go (`apigen.go`), so TypeScript and Go flipped together.

Untouched, because they are a different concept sharing the word: `SerializerModes` / `SerializerMode` /
`SerializerCode` (response framing), `router/src/routes/serializer.routes.ts`,
`client/src/lib/serializer.ts`, the `mionDeserializeRequest` / `mionSerializeResponse` wire ids, and the
class serializers. A one-line comment now says so where the framing modes are declared.

### `mutateStrict`

Params only. A return position rejects it at the TYPE level rather than degrading it, which turned out
to shape three declarations:

```ts
export type ParserStrategy = 'clone' | 'mutate' | 'mutateStrict' | 'compact';
export type ReturnParserStrategy = 'clone' | 'mutate' | 'compact';
export type ParserOption = ReturnParserStrategy | ParserPair;
```

`ReturnParserStrategy` is written out rather than `Exclude`d: the distributive conditional cost ten type
instantiations per route and failed the type-budget lane. `ParserOption` takes the narrower union
because a bare string sets BOTH directions, so `parser: 'mutateStrict'` has to be a type error; write
`{params: 'mutateStrict'}`. At runtime `directionOf` refuses it on the return side with the same message.

### One table names every family a strategy compiles

`core/src/constants.ts` holds ONE constant, `PARSE_MODES`: a row per strategy listing its encode,
decode, validate and validationErrors families by the marker token a route asks for. The same row
serves both wires. Three maps keyed three different ways (`ENCODE_FAMILY_BY_STRATEGY`,
`DECODE_FAMILY_BY_STRATEGY`, `STRATEGY_BY_ENCODE_FAMILY`) went through a two-table stage and ended here.
The exports that served them, `DECODE_SIDE_BY_DIRECTION`, `DecodeSide`, `EncodeFamily`, `DecodeFamily`
and `ParserDirection`, went with them.

What keeps `mutateStrict` off the return wire is the `ReturnParserStrategy` type, written out
literally rather than `Exclude`d: the distributive conditional cost ten extra type instantiations per
route. A spec test pins that the type and the table agree.

`JIT_FUNCTION_IDS` is no longer hand-maintained. `cmd/gen-fn-hashes` writes
`core/src/go-generated/jitFunctionIds.generated.ts` from the Go operation registry, keyed by family
name, so the ids and the run-types variant table cannot drift.

`MarkerSlots` reads the table through one `ModeFamily` indexed access. The Go mirror is `parseModes`
plus `parseMode(strategy)` in `apigen.go`; `markerKeys(isParams)` stays direction-aware because
`formatTransform` (sanitizeParams) is params-only.

Two behaviour changes come with the single table, each with its own test:

- a `mutate` return is decoded in place, so an undeclared key the handler set reaches the caller;
  `clone` and `compact` rebuild the declared shape at both ends and still drop it.
- `clone` and `compact` returns validate with `validateUnionKeys`. `serializer.routes.ts` reads that
  validator to tell a declared error in a return union from an undeclared one, and a declared
  `TypedError` still passes it.

### The return validator

`validateReturn` was declared on the route options, stored on every method, and read by nothing.
`dispatch.ts` now runs `validateReturnOrThrow` before the value is written to the response body. A
mismatch throws, so it travels as an undeclared fatal rather than a typed slot, which is right: a
handler answering the wrong shape is a server bug, not data. Default stays `false`.

`undefined` leaves the chain before that write, so the check runs on that path too, gated on
`hasReturnData`: a handler declaring a value and answering `undefined` is the bug the flag is turned on
for, while a middleFn declaring no return value is still allowed to contribute nothing.

### The discriminator

`mutate` and `mutateStrict` share `prepareForJsonMutate`, so the encode family alone stopped naming the
strategy. `strategyFromFamilies` matches a WHOLE row instead: the one `PARSE_MODES` row whose encoder,
decoder and validator are all present in the injected payload. Nothing else matches, so a payload from
a different build fails closed there rather than at call time. `direction` is gone as an argument
altogether: the `label` each call site passes already names the wire.

### `strictTypes` is gone

Declarations in router `types/general.ts`, `types/remoteMethods.ts`, `types/resolvedOptions.ts` and
`core/src/types/method.types.ts` (that last one rode the wire, so the metadata payload shape changed);
the reads in `router.ts`; the dead `methodStrictTypes` parameter on `getHandlerReflection`;
`rejectUnknownKeysOrThrow` and its call in `dispatch.ts`; and the client mirror in `lib/validation.ts`.

### MET006

Its worked example was literally this option. It now names `sanitizeParams`, a boolean router option of
the same shape that survives, and the two diagnostic catalogs were regenerated.
`apimeta_test.go`'s widened-option fixture moved to `sanitizeParams` too, and gained
`maxBodySize: undefined` so the "an undefined option is dropped" assertion still has a subject.

---

## Tests

- **`packages/run-types/test/features/unionUnknownKeys.test.ts`** — 33 tests. Group A, thirteen types
  where the check runs, each row asserting plain `validate`, `checkUnionUnknowns` and `checkUnknowns`,
  with a per-row invariant that the three are ordered from loosest to strictest. Group B, nine types
  where it must stay inert, each asserting it answers exactly as plain `validate` does, and three of
  them asserting the emitted body is identical. Group C, depth: nested, array, tuple, record value, and
  the asymmetry case. Group D, why the key families cannot all agree.
- **`packages/run-types/test/features/familyMetaCoverage.test.ts`** — `familyMeta` covers every family
  tag an entry can carry. Verified to fail when a row is removed. Without it a missing row degrades the
  call site to a validator that answers `true` for every value, with no diagnostic.
- **`ts-go-runtypes/.../typefunctions/union_keys_test.go`** — the body differs only where the check runs,
  a plain object is untouched (with `validateStrict` as the control that does differ), both tags survive
  a disk-cache round trip, and the errors family delegates to its own validator.
- **`ts-go-runtypes/.../resolver/check_union_unknowns_test.go`** — the option routes to each family, a
  plain call is unaffected, `checkUnknowns` wins when both are set, and entries are rendered for NAMED
  union members (three entries, which a variant could not produce).
- **`packages/router/src/recordUnionParams.spec.ts`** — replaces the spec that pinned the bug. Eight
  end-to-end routes: clone, compact and mutateStrict all reject the undeclared key, mutate passes it
  through, a value that really is a record is accepted, and two controls.
- Updated: `dispatch.spec.ts` (per strategy rather than per flag), `parser.spec.ts` (which validate
  family each wire compiles), `mionRouter.spec.ts`, `mionAdapter.spec.ts` (the discriminator fixture),
  `recordUnionUnknownKeys.test.ts` (a generic ordering invariant rather than a full sixth column),
  `wrapper-strategy-families.test.ts`, the test server's strict route, and the Go apigen / apimeta
  fixtures.

The already-drifted api-id fuzz fixtures were fixed while there: they named `strictTypes` and spelled
the key `encoder`.

**Verified:** the full JS suite (all seven `test:ci` batches), the Go suite, `typecheck`, `lint`,
`codegen all --check`, and the roundtrip / value / apiids fuzz lanes.

## Checked and not a problem

A union whose codec is carved out by an index-signature member looked like it might leak an undeclared
key nested one level deeper, where the union check has nothing to fire on. It does not, through a route:
the server's `restoreFromJsonClone` decoder strips it. Both shapes were measured end to end
(`{a: {x: string}} | Record<string, number>` and `Record<string, number> | {a: string}[]`), and the
handler received the cleaned value in each. The strip-strategy decoder from `createJsonDecoderFn` does
keep it, but that is a different family and not what a route runs.

## Not done, on purpose

- **Teaching the codecs which member matched.** It needs a validate walk inside every encoder, decoder
  and clone, which is the cost the split walk exists to avoid.
- **Proving at build time that two members cannot describe the same value.** A type-overlap check is a
  new compiler capability, and the validator gives the right answer without it.
- **Validating a return value in the client.** The server side ships here, behind `validateReturn`; the
  client still trusts its own server's answer, and the encoder leak above is a known limit.
- **A `checkUnionUnknowns` arm for the parse families.** The direction of travel is one unified parse
  function per route side instead of decode plus validate, and it would need the same gap filled.
