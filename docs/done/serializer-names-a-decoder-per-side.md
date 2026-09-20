---
type: fix
spec: guidelines
status: done
created: 2026-09-17
---

# The option is `serializer`, it names a decoder per side, and `direct` is gone

## What shipped

A route used to write one option, `encoder`, and it settled four separate things: how params are
encoded, how params are decoded, how the return is encoded and how the return is decoded. Two of
those run on the server and two on the client, and one lookup handed both sides the same decoder.

Three changes landed together.

### The decoder is chosen per side

```ts
// packages/core/src/constants.ts
export const DECODE_FAMILY_BY_STRATEGY = {
  clone: {server: 'restoreFromJsonClone', client: 'restoreFromJsonClone'},
  mutate: {server: 'restoreFromJsonMutate', client: 'restoreFromJsonClone'},
  compact: {server: 'compactFromJson', client: 'compactFromJson'},
} as const;
export const DECODE_SIDE_BY_DIRECTION = {params: 'server', return: 'client'} as const;
```

The server decodes params from any caller, so it rebuilds the declared shape unless the strategy
exists to pass the object through. The client decodes a return its own server wrote, and never hands
its caller a property the return type does not declare.

The direction-to-machine rule lives in one place, so no call site can pair them wrongly:
`getJitFnHashes(jitHash, strategy, direction)` reads the side off the direction, and
`strategyFromFamilies` takes the same direction and expects the same entry. At the type level
`ParamsDecode` resolves `ServerDecodeFamily` and `ReturnDecode` resolves `ClientDecodeFamily`
(`packages/router/src/types/serializer.ts`).

**One behaviour change:** a `mutate` return no longer reaches the client's caller carrying keys the
return type does not declare. `mutate` still passes them through on params, which is what it is for.

The same table exists a second time in Go, at
`ts-go-runtypes/internal/compiler/resolver/apigen.go`, because it is what the bundled client reads.
It was split the same way. The `client-bundled` and `client-mixed` vitest lanes are what catch the
two copies disagreeing.

### The option is `serializer`

`encoder` was the only place the codebase said "encoder": the framing enum is `SerializerModes`, the
router module is `routes/serializer.routes.ts` and the client module is `lib/serializer.ts`. The
option and every identifier built on the word renamed, and the files moved with them
(`core/src/serializer.ts`, `router/src/types/serializer.ts`, `router/src/serializer.spec.ts`).

`encoder` was **removed outright**, with no retired `encoder?: never` and no deprecation alias: it
was never published. The retired `serializer?: never` became the real key, and `RetiredOptions` went
with it.

`SerializerStrategy` is written out as `'clone' | 'mutate' | 'compact'` rather than `Exclude`d from
the RunTypes union. The conditional cost about ten type instantiations per route and broke the
type-budget lane; `packages/core/src/serializer.spec.ts` pins the subset relationship instead.

### `direct` left mion

It was measured against `clone` on a 40,000-product catalog, 13.5 MB of JSON, identical bytes from
every lane, stable across both orderings and two payload sizes:

| lane | peak heap | ms per call |
| --- | --- | --- |
| `clone`, prepare + `JSON.stringify` (the router's path) | 22.1 MB | 75 |
| `clone`, one-call encoder | 22.1 MB | 88 |
| `direct` | 66.1 MB | 162 |

Three times the memory and about twice the time. The one thing it was meant to buy, encoding without
allocating a clone, it does not buy: the intermediate strings cost more than the clone did. It stays
in `@mionjs/run-types`, where `createJsonEncoderFn` still offers it.

Removing it also settled its asymmetry: it dropped undeclared keys when writing the wire and kept
them when reading one.

### The response framing went with it

`direct` was the only strategy that made a response frame as `stringifyJson`, so `getChainFraming`
and `packages/router/src/lib/framing.ts` are deleted and a route response is always a JSON-safe
value the adapter stringifies. The dead `stringifyJson` arm went from the response switch of all
seven platform adapters, and `serializer.routes.ts` lost `stringifyBody` and
`stringifyHandlerReturnValue`.

Two producers had nothing to do with `direct` and were retired too, which is what made the switches
collapse: the pre-router fatal error (`lib/dispatchError.ts`) now hands the adapter a body to
stringify like everything else, and the metadata middleFn no longer forces the framing. Its answer
rides the union envelope every union rides, which the client already unwrapped.

**`SerializerModes.stringifyJson` stays.** It is still the REQUEST framing every adapter sets, and
the client's own default wire.

## The moot `strictTypes` question

Answered as the written condition rather than a shipped diagnostic. `strictTypes` does something
only when the SERVER's params decoder keeps undeclared keys, which after the split is `mutate`
alone. Under `clone` or `compact` the key is gone before the check runs.

It is stated in three places: the `UnknownKeys` comment in `packages/router/src/types/serializer.ts`,
the Strict Types section of the validation page, and the routes page. A build-time signal for the
combination that cannot do anything was NOT shipped: it needs its own diagnostic code, catalog entry
and Go-side wiring, which is a feature rather than part of this fix.

## Documents this may have left stale

- `docs/done/per-route-encoder-strategies.md` describes the option under its old name and lists the
  old example filenames. It is a record of what shipped then, so it was left as it is.
