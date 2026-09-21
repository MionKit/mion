---
type: fix
spec: full-plan
status: ready
created: 2026-09-21
---

# An undeclared key reaches the handler when a union carries a record member

## Problem

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

**The router then assumes step one did its job.** `packages/router/src/types/serializer.ts:66`:

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

Returns are deliberately not validated, on the server or in the client. A handler is the
application's own code, and the client's decoder rebuilds the declared shape. This is recorded as a
known limit, not scheduled work.

---

## Part 1 — a validate option that checks keys against the matched union member

### The option

```ts
// packages/run-types/src/createRTFunctions.ts, on ValidateOptions
checkUnionUnknowns?: boolean;   // default FALSE
```

On a union, a value is rejected when it carries a key the member that matched does not declare. It
does nothing on a plain object, where the loose reading matches TypeScript assignability.

Default `false`, so `createValidateFn<T>()` keeps its exact current behaviour, its exact fnHashes and
its whole disk cache. The router opts in per strategy (Part 2). A standalone caller who wants it asks
for it.

### When the check runs — TWO OR MORE key-bearing members

The check runs **only** on a union with at least two members that can carry keys. With one such
member there is no ambiguity about whose key list applies, and running it anyway would silently turn
`{a: string} | number` into a strict object check, which is `checkUnknowns`' job and breaks
TypeScript assignability for the object arm.

"Key-bearing" spans BOTH buckets of `FlatLayout` (`union_flat_layout.go:15`), which is the trap: a
record is NOT an `ObjectMember`.

- `ObjectMembers` — plain object literals and interfaces, the mergeable ones.
- `AtomicMembers` — atomics, **index-signature objects**, named classes, arrays, tuples, Date, Map, Set.

So the count is `len(ObjectMembers)` plus the `AtomicMembers` that are index-signature objects or
named classes. Arrays, tuples, Date, Map, Set and primitives carry no per-name properties and do not
count.

| type | key-bearing | check |
| --- | --- | --- |
| `{a:string} \| {b:number}` | 2 objects | runs |
| `{a:string} \| Record<string,number>` | 1 object + 1 record | runs |
| `Record<string,number> \| Record<string,string>` | 2 records | runs |
| `BaseErr \| {a:string}` | 1 class + 1 object | runs |
| `{a:string} \| number` | 1 object | **no** |
| `{a:string} \| number \| string \| null` | 1 object | **no** |
| `Record<string,number> \| number` | 1 record | **no** |
| `BaseErr \| string` | 1 class | **no** |
| `{a:string}[] \| number` | 0 (array is atomic) | **no** |
| `string \| number` | 0 | **no** |
| `Date \| string` | 0 | **no** |

When the check does not run, the emitted body must be **identical** to the plain `validate` family's,
not merely equivalent. That is a testable claim and Group B below pins it.

### Precedence

`checkUnionUnknowns` defaults false and `checkUnknowns` already exists, so the scanner needs an order:

| call site | family |
| --- | --- |
| `{checkUnknowns: true}` | `validateStrict` (already covers unions) |
| `{checkUnionUnknowns: true}` | the new family |
| anything else, including no options | `validate`, unchanged |

`checkUnknowns` wins when both are set: it is strictly stronger.

### It must be a FAMILY, not a variant

Not negotiable, and the reason is recorded from the fused-validator work: no variant entry is
disk-cached (the read and the write in `module.go` are both gated on `variantSuffix == ""`), variant
walkers keep the plain family's `InnerPrefix` so children dispatch to plain entries, and overrides
skip variants. A variant would leave every NAMED nested type unchecked, which is the common shape.

### How the family is actually selected

The JS runtime **throws the option away**: `createTypeFnArgsFunction`
(`packages/run-types/src/createRTFunctions.ts:358`) discards `_options`. The family is chosen at
BUILD time by the Go scanner and carried in the injected tuple's baked fnHash.

```go
// ts-go-runtypes/internal/compiler/resolver/scan.go:1317 — the one switch over family names
"validate"         → "validateStrict"
"validationErrors" → "validationErrorsStrict"
```

Read by `extractCheckUnknownsOption` (`scan.go:1247`), called from `computeSiteFn` (`scan.go:978`).

### The nine hand edits

Name the family `validateUnionKeys` / `validationErrorsUnionKeys`. Tags must be unique and at most
four characters: `vuk` and `veuk`.

**Go (6):**

1. `ts-go-runtypes/internal/constants/constants.go:50` — a `CacheModules` row per family.
2. `ts-go-runtypes/internal/cachegen/operations/operations.go:67` — a registry row per family.
   `Doc` and `Factory` are mandatory for `Public: true`.
3. A new emitter file beside `typefunctions/validate_strict.go`, following its shape exactly:
   `type ValidateUnionKeysEmitter struct{ ValidateEmitter }` plus a marker interface, mirroring
   `StrictUnknownKeys` (`validate_strict.go:63`) and `EmitContext.ChecksUnknownKeys`
   (`emitter.go:162`). The splice point is the UNION arm only, never the object arm.
4. `typefunctions/families.go:66` — the rows, inserted BEFORE the last one. `validate` must stay last.
5. `resolver/scan.go:1317` — extend the family swap with the precedence table above.
6. `resolver/scan.go:1247` and `:978` — an `extractCheckUnionUnknownsOption` beside the existing one.

**TypeScript (3):**

7. `packages/run-types/src/createRTFunctions.ts:88` — the `ValidateOptions` field.
8. `packages/run-types/src/createRTFunctions.ts:692` — `RTFunctionByKey` entries.
9. `packages/run-types/src/runtypes/entryTuple.ts:392` — `familyMeta` entries. **See the trap below.**

**Then regenerate**, none hand-edited: `pnpm miondevx core codegen all` covers
`fnHashes.generated.ts`, the devtools constants mirror and the website function catalog.

### The silent-failure trap

`familyMeta` (`packages/run-types/src/runtypes/entryTuple.ts:386`) is hand-written and **no test
enumerates it**:

```ts
const meta = familyMeta[record.familyTag];
if (!meta) return false; // unknown future family — leave to the identity fallback
```

Miss the entry and `registerTypeFnTuple` silently degrades the call site to the identity fallback: a
validator that returns `true` for every input, with no diagnostic. That is the exact shape of the
`FN_HASH_LEN` bug, which every hand-written test passed and only the fuzz lane caught.

**Add a test asserting `Object.keys(familyMeta)` covers `FAMILY_TAG_TO_FN_KEY`, in this PR.**

### The fnHash collision risk

`FnHashLen = 4` (`ts-go-runtypes/internal/cachegen/operations/fnhash.go:14`) and
`mustBeCollisionFree` panics at package init when two canonical keys hash alike (`fnhash.go:187`).
Two new families add two variant matrices, so a collision is plausible. The prescribed remedy is
bumping the length, never renaming an operation.

If it trips: bump **both** `FnHashLen` and the hand-written mirror `FN_HASH_LEN`
(`packages/run-types/src/runtypes/entryTuple.ts:25`), then run the fuzz lane, not just the unit
tests. A one-sided bump is what produced the always-true validator last time.

---

## Part 2 — the router runs one validator, and the strategy says which

### The model

```
clone          decoder strips + validate {checkUnionUnknowns: true}
compact        decoder strips + validate {checkUnionUnknowns: true}
mutate         nothing stripped, keys reach the handler, plain validate
mutateStrict   validate {checkUnknowns: true}
```

The router never calls `hasUnknownKeys` or `unknownKeyErrors` again. They stay public standalone
APIs answering the other question.

### Step 1 — rename the option to `parser`

The strategy now selects the encoder, the decoder **and** the validator, so `serializer` names one of
three jobs. Params are parsed by the server and returns are parsed by the client, so `parser` covers
both directions of the inbound half.

Rename the option and every identifier built on the word: `SerializerStrategy`, `SerializerOption`,
`SerializerPair`, `ResolvedSerializer`, `SerializerDirection`, `SerializerOf`, `SerializerLiteralGuard`,
and the module files `core/src/serializer.ts`, `router/src/types/serializer.ts`,
`router/src/serializer.spec.ts`.

**Leave `SerializerModes` / `SerializerMode` / `SerializerCode` alone.** They are response framing
(`json`, `stringifyJson`, `optimistic`), a different concept that only shares the word. Say so in a
one-line comment where they are declared, or the next reader will "finish" the rename.

`serializer` was never published, so it is removed outright with no alias, the way `encoder` was.

Its own commit, ahead of the behaviour changes, so the behaviour diff stays readable.

### Step 2 — add the `mutateStrict` strategy

```ts
// packages/core/src/types/general.types.ts:17
export type ParserStrategy = 'clone' | 'mutate' | 'mutateStrict' | 'compact';
```

Params only. A bare string `parser: 'mutateStrict'` sets both directions, and strictness is
meaningless on the return side, so the return position must REJECT it at the type level rather than
degrading it to `mutate`. An error beats a silent downgrade.

Runtime sites that enumerate the strategies:

- `packages/core/src/serializer.ts:18` `SERIALIZER_STRATEGIES`, which drives `isSerializerStrategy`
  and the error text in `directionOf`.
- `packages/core/src/constants.ts:88` `ENCODE_FAMILY_BY_STRATEGY` — `mutateStrict` maps to
  `prepareForJsonMutate`.
- `packages/core/src/constants.ts:95` `DECODE_FAMILY_BY_STRATEGY` — `{server: 'restoreFromJsonMutate',
  client: 'restoreFromJsonClone'}`.
- `packages/core/src/routerUtils.ts:118` `getJitFnHashes` — needs work, because `isType` / `typeErrors`
  are strategy-independent today and now must vary per strategy.
- **Go mirror** `ts-go-runtypes/internal/compiler/resolver/apigen.go:517` `encodeFamily` /
  `serverDecodeFamily` / `clientDecodeFamily`, plus `serializerStrategies` at `:503`. The resolver
  binary must be rebuilt.

Type-level twins in `packages/router/src/types/serializer.ts`: `EncodeFamily` (:32),
`ServerDecodeFamily` (:41 — add the arm BEFORE the `S extends string` catch-all, which would
otherwise send it to `restoreFromJsonClone`), `ClientDecodeFamily` (:49, catch-all already correct).

`MarkerSlots` (:95) swaps the fixed `'validate', 'validationErrors'` in the params slot for a
strategy-driven pair, following the existing `ParamsHasUnknownKeys` pattern:

```ts
type ParamsValidate<S> = S extends 'mutateStrict' ? 'validateStrict'
  : S extends 'mutate' ? 'validate' : 'validateUnionKeys';
```

The `returnFns` slot keeps the plain pair. **Keep any new conditional INSIDE the tuple element**: an
alias wrapped around an `InjectTypeFnArgs` marker hides it from the scanner (the warning at
`types/mionRouter.ts:42`).

### Step 3 — teach the runtime to tell `mutate` from `mutateStrict`

`strategyFromFamilies` (`packages/core/src/runtypes/mionAdapter.ts:192`) infers the strategy purely
from the injected encode family. `mutate` and `mutateStrict` share `prepareForJsonMutate`, so
`STRATEGY_BY_ENCODE_FAMILY` stops being one-to-one and `assertCompiledSerializer`
(`packages/router/src/lib/reflection.ts:126`) would throw on every `mutateStrict` route.

**Chosen: the validate family breaks the tie.** Three lines at `mionAdapter.ts:209`:

```ts
const base = STRATEGY_BY_ENCODE_FAMILY[encodeFamilies[0]];
// mutate and mutateStrict share an encoder; the validate family is what tells them apart
const strategy =
  base === 'mutate' && direction === 'params' && fns.validateStrict !== undefined ? 'mutateStrict' : base;
```

The `direction === 'params'` guard is load-bearing: the return side always compiles the plain
`validate` pair, so without it a return wire misreads.

Considered and not chosen: giving `mutateStrict` its own encode family (a second trip through the
nine-edit checklist for a body byte-identical to `prepareForJsonMutate`), and carrying the strategy
literal in the marker payload (the better long-term shape, but a wire protocol change across the
resolver, the adapter and both client lanes, which should not ride on a bug fix).

Also add `validateStrict` and `validationErrorsStrict` to `MION_FN_KEYS`
(`packages/core/src/runtypes/mionAdapter.ts:38`), and the new union-keys pair, or no route can request
them.

### Step 4 — delete `strictTypes`

Declarations: `packages/router/src/types/general.ts:39`, `types/remoteMethods.ts:60` and `:75`,
`types/resolvedOptions.ts:36` and `:51`, `packages/core/src/types/method.types.ts:55`. The last one
rides the wire to the client, so the metadata payload shape changes.

Runtime reads: `packages/router/src/router.ts:498, 519, 576, 596`; `lib/reflection.ts:97` (drop the
`methodStrictTypes` parameter entirely); `dispatch.ts:312` and `:314-330` — **delete**
`rejectUnknownKeysOrThrow` and its call, the fused validator already answers.

Client: `packages/client/src/lib/validation.ts:59-63`. The block goes; `paramsJit.isType` and
`typeErrors` already point at the right family, so the local gate needs no flag.

Stale after removal: `packages/core/src/types/general.types.ts:136,138` docblocks,
`packages/core/src/constants.ts:75-76` comments, `mionAdapter.ts:255,268`, `routerUtils.ts:169`.

### Step 5 — the MET006 diagnostic

Its example is literally this option, at `ts-go-runtypes/internal/diagnostics/messages.go:173`:

```
-  mion.route(handler, {strictTypes: isProd})
+  mion.route(handler, {strictTypes: true})
```

Replace with `sanitizeParams`, a boolean of the same shape that survives. Not `parser`, which has its
own guard (`SerializerLiteralGuard`, CTA001/CTA004) so a widened one never reaches MET006. Then
regenerate `packages/devtools/src/core/go-generated/diagnosticCatalog.generated.ts` and
`container/website/app/components/content/go-generated/diagnostics-catalog.json`.

`ts-go-runtypes/internal/compiler/apimeta/apimeta_test.go:380,390,393` uses `strictTypes: boolean` as
THE widened-option fixture and asserts `WidenedOptions == "strictTypes"`. Re-point it.

---

## Tests

`packages/run-types/test/features/recordUnionUnknownKeys.test.ts` exists and already pins eight
shapes plus two controls, each row asserting the decoder, `validate`, the two-step composition and
`checkUnknowns`, with the invariant that the fused validator is never looser than the two-step one.
It is the spine. Every group below adds a `checkUnionUnknowns` column to that shape, so a family that
stops agreeing names itself.

Each row asserts the same five things unless noted: `decode {strategy: 'strip'}`, `validate`,
`validate && !hasUnknownKeys`, `validate {checkUnionUnknowns: true}`, `validate {checkUnknowns: true}`.

### Group A — the check RUNS: two or more key-bearing members

| # | type | values to cover |
| --- | --- | --- |
| A1 | `{a: string} \| {b: number}` | `{a:'x'}` · `{a:'x', b:1}` (sibling key) · `{a:'x', zzz:9}` · `{b:1}` · `{}` |
| A2 | `{kind:'cat'; meows:boolean} \| {kind:'dog'; barks:number}` | clean cat · `{kind:'cat', meows:true, barks:3}` (sibling) · `{kind:'cat', meows:true, zzz:9}` · clean dog |
| A3 | `{a: string} \| Record<string, number>` | `{a:'x'}` · `{a:'x', evil:'garbage'}` · `{a:'x', evil:1}` · `{p:1, q:2}` · `{}` |
| A4 | `{a: string} \| Record<string, string>` | `{a:'x', evil:'garbage'}` must stay ACCEPTED, it really is a record · `{a:'x', evil:1}` rejected · `{p:1,q:2}` |
| A5 | `{a: number} \| Record<string, number>` | `{a:1}` · `{a:1, evil:2}` accepted · `{a:1, evil:'s'}` rejected |
| A6 | `{a: string; b: number} \| Record<string, number>` | `{a:'x', b:1}` · `{a:'x', b:1, evil:'g'}` · `{a:'x', b:1, evil:2}` |
| A7 | `{kind:'cat'; meows:boolean} \| Record<string, number>` | a discriminant does not rescue the pooled check |
| A8 | `{a: string} \| Record<string, unknown>` | every value ACCEPTED, the record really does declare every key |
| A9 | `Record<string, number> \| Record<string, string>` | two records, no plain object member at all |
| A10 | `{a: string} \| {b: number} \| {c: boolean}` | three members; a key from each sibling |
| A11 | `{id: string; x: number} \| {id: number; y: string}` | shared prop name, different types; `{id:'a', x:1, y:'b'}` |
| A12 | `{a: string; b?: number} \| {c: string}` | an optional prop is DECLARED: `{a:'x', b:1}` accepted, `{a:'x', c:'y'}` rejected |
| A13 | `{a: string} \| {b: number} \| number` | a non-key atomic beside two objects does not switch the check off |

A4 and A8 are the load-bearing ones: they prove the check is per matched branch, not "reject anything
extra". A12 pins that optional means declared, not absent.

### Group B — the check must NOT run: fewer than two key-bearing members

For every row: **`checkUnionUnknowns: true` answers identically to plain `validate`, on every value.**

| # | type | why |
| --- | --- | --- |
| B1 | `{a: string} \| number` | one object member, nothing to disambiguate |
| B2 | `{a: string} \| number \| string \| null` | several atomics, still one object |
| B3 | `Record<string, number> \| number` | one record; a record declares every key, nothing can be unknown |
| B4 | `string \| number` | no key-bearing member |
| B5 | `Date \| string` | Date is atomic and exposes no per-name properties |
| B6 | `{a: string}[] \| number` | the array is an ATOMIC member, so the union has zero object members |
| B7 | `Map<string, number> \| string` | Map holds entries, not properties |
| B8 | `BaseErr \| string` (a named class) | one class member |
| B9 | `{a: string}` (not a union) | the option is inert outside a union |

Values per row include one carrying an undeclared key, which must be ACCEPTED under
`checkUnionUnknowns` exactly as plain `validate` accepts it, and REJECTED under `checkUnknowns`. That
contrast is what proves the two options are different tools.

**Stronger than behaviour, pin the emitted code.** For at least B1, B4 and B9, assert the generated
body under `checkUnionUnknowns: true` is byte-identical to the plain `validate` body, in the style of
`packages/run-types/test/features/generatedCodeAudit.test.ts`. Behavioural equality can hide a check
that runs and happens to pass; body equality cannot.

### Group C — where the check sits, and where it stops

| # | type | pins |
| --- | --- | --- |
| C1 | `{pet: {kind:'cat';meows:boolean} \| {kind:'dog';barks:number}}` | a union nested under a property still gets checked |
| C2 | `({a:string} \| {b:number})[]` | a union inside an array |
| C3 | `[{a:string} \| {b:number}, string]` | a union in a tuple slot |
| C4 | `Record<string, {a:string} \| {b:number}>` | a union as a record VALUE type |
| C5 | `{a: {x: string}} \| Record<string, number>` | **the asymmetry**, see below |

C5 is the one that earns two options existing:

```ts
type RecUnion = {a: {x: string}} | Record<string, number>;
const value = {a: {x: 'v', evil: 1}};   // evil sits on a PLAIN object inside a member

validate                          → true
hasUnknownKeys                    → false   // source is () => false, the whole subtree
validate {checkUnionUnknowns}     → true    // evil is not on a union node
validate {checkUnknowns}          → false   // the only one that reaches it
```

The test comment must say plainly that `checkUnionUnknowns` is not a weaker `checkUnknowns`: it
answers "does the matched member declare this key", and a plain object nested inside a member is not
a union node. That is why `mutateStrict` uses `checkUnknowns` and clone/compact use
`checkUnionUnknowns`.

### Group D — why the families cannot all agree

One test whose body is prose plus assertions, stating the rule once:

- `hasUnknownKeys`, `unknownKeyErrors` and every stripping codec answer **"is any key declared by no
  member"**. On a record union that is honestly always no.
- `checkUnionUnknowns` and `checkUnknowns` answer **"is any key undeclared by the member that
  matched"**.
- Making the first group answer the second question means validating inside every encoder, decoder
  and clone, which is the cost the split walk exists to avoid.

Assert it, do not just write it: over the Group A corpus, `hasUnknownKeys` never reports a key that
belongs to some member, and the two options do. A row where all families agree (`{kind:'cat',
meows:true, zzz:9}`, a key belonging to nobody) is asserted as the case that must NEVER drift.

### Group E — the family plumbing

- **`familyMeta` coverage:** `Object.keys(familyMeta)` covers `Object.keys(FAMILY_TAG_TO_FN_KEY)`.
  Without it a missing entry degrades the call site to a validator that returns `true` for every
  input, silently. This is the highest-value test in the PR.
- **Disk-cache round-trip** for both new families, copying
  `typefunctions/module_disk_strict_test.go:40`.
- **Family tag length** is already covered by `generatedCodeAudit.test.ts:196`; confirm it fails if a
  tag longer than four characters is used.
- **`families_test.go:13`** hardcodes `len(Families) != 23`; bump to 25.
- **Marker test coverage rule:** both `getRunTypeId` call shapes, as paired tests.
- **Go emitter tests** beside `validate_strict.go`'s, asserting the splice lands on the union arm
  only, and that a one-object-member union emits no check.

### Group F — the router

- `packages/router/src/strictTypesRecordUnion.spec.ts` pins today's behaviour; rename it and flip the
  two assertions that currently expect a handler call to expect a `validation-error`. Its two controls
  stay.
- A route per strategy, same payload, asserting what the handler receives:
  `clone` / `compact` reject, `mutate` accepts and passes the key through, `mutateStrict` rejects.
- A Group B type as a param (`{a: string} | number`) on a `clone` route, asserting the undeclared key
  is dropped by the decoder and no error is raised. That proves the scoping rule survives the router.
- `dispatch.spec.ts:625-700` — the per-route override tests become `parser: 'mutateStrict'` versus
  `'mutate'`.
- `serializer.spec.ts:143-197` inverts: no strategy compiles the unknown-key pair any more; the
  assertions become which VALIDATE family each strategy compiles.
- `mionRouter.spec.ts:188-282` — every `strictTypes` key leaves both the type literal and the runtime
  object.
- `packages/core/src/serializer.spec.ts:9-15` asserts `SerializerStrategy extends JsonEncoderStrategy`.
  **Adding `mutateStrict` breaks this at type level**, since run-types has no such encoder strategy.
  Reframe it to map `mutateStrict` onto `mutate` for the encoder.
- `packages/core/src/runtypes/mionAdapter.spec.ts` needs a `mutateStrict` fixture, including a RETURN
  wire on `prepareForJsonMutate`, which must still read as `mutate`. That is the `direction === 'params'`
  guard in step 3 and nothing else tests it.
- `packages/devtools/test/wrapper-strategy-families.test.ts` gains an end-to-end `mutateStrict` case.
- `packages/test-server/src/test-server.ts:273` moves to `{parser: {params: 'mutateStrict'}}`; its
  three client tests in `packages/client/src/lib/validation.spec.ts` must pass unchanged, which is the
  check that the whole chain holds.

## Fuzzing

The api-id fuzz fixtures at `packages/run-types/test/fuzz/apiids/apiIdsFuzz.ts:67,121` name
`strictTypes: undefined` and spell the key `encoder`, already drifted. Fix both while there.

Run the round-trip fuzz lane after the family addition. It is the lane that caught the last
always-true validator, and the `familyMeta` trap has the same signature.

## Docs

Placement follows the *Where a change goes* table in `container/website/CLAUDE.md:130`.

**Part 1**, `02.runtypes/02.guide/03.validation.md`: a row for `checkUnionUnknowns` in
`## Validation Options` (73-87), noting `checkUnknowns` is not in that table today and both should
end up in one place. `## Checking for Unknown Keys` (99-107) says which option answers which question.
`## Unknown Key Factories` (109-121) extends its closing sentence: it never says today that a union
with an index-signature member makes the whole family answer "nothing found".
`05.json-serialization.md` parse-strategy table (109-117) says "the same rule `checkUnknowns` applies",
now ambiguous. `10.linting.md` and its mirror `01.rpc/06.devtools/01.linter.md` carry the
`runtypes/unknown-keys` row.

**Part 2**: `01.rpc/02.server/07.validation.md` `## Strict Types` (49-74) is the canonical page and is
rewritten around the strategy. `01.rpc/02.server/01.routes.md` `## Strict Types` (103-113) — every
sentence dies with the option. `09.security.md` table row (22). `08.serialization.md`
`## Serializer Strategies` (16-32) gains a row, and "On params only `mutate` keeps them" becomes
false; `## What Each Route Compiles` (58-60) too.

Three landmines:

1. **The `#strict-types` anchor is linked from three pages.** Renaming the heading changes the URL
   anchor; grep the content tree and update every link.
2. **`#### Using strictTypes with run-types` and `#### Using strictTypes in the router` already break
   the "no code names in a title" rule.** Fold them away, do not rename them to `mutateStrict`.
3. **This note is the bug, written down as a feature.** Replace it, do not edit it:

   > When a type has an index signature (e.g. `[key: string]: any`), `strictTypes` is automatically
   > skipped since the type explicitly allows arbitrary properties.

Examples: `packages/examples/src/router/strict-types-example.routes.ts` collapses to
`parser: {params: 'mutateStrict'}` and is `<code-import>`ed by TWO pages, so one edit changes both
renders. `run-types/strict-types-example.ts` names the removed option in a comment.
`router/serializer-strategies.ts` and `router/serializer-per-route.ts` gain the new strategy.
`guide/unknown-keys-check-unknowns.ts` is where `checkUnionUnknowns` is shown.
`guide/validation-options.ts` if the option joins the table.

The `::function-catalog` block on `15.all-compiled-functions.md` is machine-generated: run codegen,
do not edit it.

**CI labels at open time:** `website` (required, `packages/examples/` moves its hash on its own),
`pre-publish-e2e` (required, public API rename across router, core, client and run-types), and check
`bench`, since `container/mion-bench/shared/zod-schemas.mjs` matched the `strictTypes` grep. Confirm
with `pnpm miondevx core lanes`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and
example this change touched, review its report against the code, and commit it as its own commit.

## Out of scope

- **Teaching the codecs which member matched.** It needs a validate walk inside every encoder,
  decoder and clone, which is the cost the split walk exists to avoid.
- **Proving at build time that two members cannot describe the same value.** A type-overlap check is
  a new compiler capability, far larger than this fix, and the fused validator already gives the right
  answer without it.
- **Validating return values**, on the server or in the client. The encoder leak above is a known
  limit.
- **A `checkUnionUnknowns` arm for the parse families.** The direction of travel is one unified parse
  function per route side instead of decode plus validate, and the gap this todo fills is the same one
  that would need. Not this change.

## Done when

`createValidateFn({checkUnionUnknowns: true})` rejects a value carrying a key the matched union member
does not declare, on any union with two or more key-bearing members, and emits a body byte-identical
to plain `validate` on every other shape; `createValidateFn<T>()` is byte-identical to today; the
router option is `parser`, `strictTypes` is gone from every package, `mutateStrict` exists and is
params-only, and the router requests exactly one validate family per strategy and never
`hasUnknownKeys`; the record-union tests assert an error where they assert a handler call today; the
`familyMeta` coverage test exists; the full JS suite, the Go tests and the round-trip fuzz lane pass;
the simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
source file, each committed on its own.
