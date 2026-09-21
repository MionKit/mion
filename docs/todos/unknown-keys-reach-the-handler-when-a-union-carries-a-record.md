---
type: fix
spec: guidelines
status: ready
created: 2026-09-21
---

# An undeclared key reaches the handler when a union carries a record member

## Intent

A `strictTypes` route accepts a payload carrying a key no member of the param type declares, and hands it
to the handler untouched, whenever the param type is a union with an index-signature member. No error is
raised. The library's own strict validator refuses the same value.

Reproduced end to end through `dispatchRoute`:

```ts
type Something = {a: string} | Record<string, number>;
```

```
payload {a: 'x', evil: 'garbage'}     strictTypes: true

clone (default)  handler receives {a: 'x', evil: 'garbage'}   no error
mutate           handler receives {a: 'x', evil: 'garbage'}   no error
{a: string}      handler receives {a: 'x'}                    (control, key dropped)
```

## Why it happens

Three separate decisions compose into a hole.

**One. A record member switches the unknown-key families off for the whole union.**
`ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_union.go:35`:

```go
// Index-sig carve-out: the value might match the indexed branch, where every key is declared via the pattern.
if layout.hasIndexSignatureMember(ctx) {
    return RTCode{Code: "", Type: opts.CodeShape}
}
```

The same carve-out sits in the encoder (`union_flat.go:482`), the clone prepare (`json_prepare_clone.go:768`)
and the restore (`json_restore_clone.go:268`). The emitted code:

```js
hasUnknownKeys = () => false
encode         = (v) => JSON.stringify(v)
```

The carve-out is correct on its own terms: a value matching the record member really does declare every key,
and a codec never validates, so it cannot know which member matched.

**Two. The router assumes the decoder already stripped.**
`packages/router/src/types/serializer.ts:66`:

```ts
/** `mutate` alone keeps undeclared keys: every other params decoder rebuilds the declared shape, so the
 *  key is gone before the check runs. */
type UnknownKeys<Strategy, Key> = Strategy extends 'mutate' ? Key : never;
```

So on `clone` and `compact` the unknown-key check is not compiled at all. The comment's premise fails for a
record union: the decoder rebuilds nothing and keeps every key.

**Three. Plain validate accepts extra keys on an object member.**
The union's OR chain matches `{a: 'x', evil: 'garbage'}` against `{a: string}` and stops there. So the
`strictTypes` composition, `validate` then the pooled key check, answers yes twice.

## The family that already answers correctly

`createValidateFn({checkUnknowns: true})` inherits validate's branch chain and carries the key check inside
each arm, so it answers per matched member. Measured across six record-union shapes and two controls, it is
right on every row, and it is never looser than the two-step composition.

| type | value | validate + hasUnknownKeys | `{checkUnknowns: true}` |
| --- | --- | --- | --- |
| `{a: string} \| Record<string, number>` | `{a:'x', evil:'garbage'}` | accepts | refuses |
| `{a: string} \| Record<string, number>` | `{a:'x', evil:1}` | accepts | refuses |
| `{a: string} \| Record<string, string>` | `{a:'x', evil:'garbage'}` | accepts | accepts, it IS a record |
| `{a: string} \| Record<string, string>` | `{a:'x', evil:1}` | accepts | refuses |
| `{a: number} \| Record<string, number>` | `{a:1, evil:'s'}` | accepts | refuses |
| `{a: string; b: number} \| Record<string, number>` | `{a:'x', b:1, evil:2}` | accepts | refuses |
| `{kind:'cat'; meows:boolean} \| Record<string, number>` | `{kind:'cat', meows:true, evil:2}` | accepts | refuses |
| `{a: string} \| Record<string, unknown>` | any object | accepts | accepts, correct |

The families are already built: `family("validateStrict", …)` and `family("validationErrorsStrict", …)` in
`ts-go-runtypes/internal/cachegen/typefunctions/families.go:65`. They are simply not in the router's marker
vocabulary, so no route can ask for them.

## Direction

**`strictTypes` runs the fused validator, on every strategy.** One walk instead of two, and the router's
strictness matches the library's.

- Add `validateStrict` and `validationErrorsStrict` to `MION_FN_KEYS`
  (`packages/core/src/runtypes/mionAdapter.ts:38`) and to the marker slots in
  `packages/router/src/types/serializer.ts`.
- A route with `strictTypes` on requests those two INSTEAD of `validate` + `hasUnknownKeys`, whatever its
  params strategy. Drop the `Strategy extends 'mutate'` gate: it encodes an assumption that does not hold.
- Delete `rejectUnknownKeysOrThrow` (`packages/router/src/dispatch.ts:314`). `validateParametersOrThrow`
  calls the fused validator and reports through `validationErrorsStrict`.

This is a behaviour change for existing routes: a union param that passes today starts failing. That is the
point of the fix, and it should ship as a breaking change with a changelog line.

Explicitly NOT in scope, and worth writing down so it is not reopened:

- **Teaching the codecs which member matched.** It needs a validate walk inside every encoder and decoder,
  which is the cost the split walk exists to avoid.
- **Proving at build time that two members cannot describe the same value.** A type-overlap check is a new
  compiler capability, far larger than this fix, and the fused validator already gives the right answer
  without it.

## The return side

A handler returning such a union writes every own property to the wire, because its encoder is
`JSON.stringify(v)`:

```
encode({a: 'public', passwordHash: 'SECRET'})  →  {"a":"public","passwordHash":"SECRET"}
```

The return side runs no validator, and adding one would cost a walk on every response. Decide between:

- leaving it, since a handler is the application's own code rather than a caller's payload, and
- a build-time warning on a return type whose union carries a record member, saying the encoder will not
  drop undeclared keys.

A warning is the cheaper half and is the recommendation unless measurement says otherwise.

## The standalone families

`hasUnknownKeys` and `unknownKeyErrors` keep answering "does any key belong to no member", which on a record
union is always no. That answer is defensible for a codec-facing question, but it is a different question
from "does this value match the type", and today nothing says so. Give the two questions distinct wording in
the API docs so a consumer reaching for `hasUnknownKeys` as a security check is told to use
`{checkUnknowns: true}` instead.

## Tests already in the tree

Written while scoping this, pinning today's behaviour so the assertions flip in the same commit as the fix:

- `packages/run-types/test/features/recordUnionUnknownKeys.test.ts` — the eight shapes above, each row
  asserting the decoder, `validate`, the two-step composition, the fused validator and the encoder, plus the
  invariant that the fused validator is never looser than the two-step one.
- `packages/router/src/strictTypesRecordUnion.spec.ts` — the end-to-end dispatch proof on both the `clone`
  and `mutate` strategies, with a plain object and a record-free union as controls.

## Done when

`strictTypes` runs exactly one check, the fused validator, on every params strategy; the two router tests
assert an error instead of a handler call; the record-union rows in the runtypes test show the two-step
column gone; the route docs say what `strictTypes` checks; and the return-side decision is written down,
with its warning shipped if that is the choice.
