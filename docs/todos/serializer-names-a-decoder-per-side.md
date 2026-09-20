---
type: fix
spec: guidelines
status: ready
created: 2026-09-17
---

# One `encoder` name gives both sides the same decoder, and the option is the only place the app says "encoder"

## Intent

A route writes one option, `encoder`, and it settles four separate things: how the params are
encoded, how the params are decoded, how the return is encoded and how the return is decoded. Two of
those run on the server and two on the client, and one lookup hands both sides the same decoder.

```ts
// packages/core/src/constants.ts:132
export const DECODE_FAMILY_BY_STRATEGY = {
  clone: 'restoreFromJsonClone',
  mutate: 'restoreFromJsonMutate',
  direct: 'restoreFromJsonMutate',
  compact: 'compactFromJson',
};
```

The two sides do not face the same problem, so one entry cannot be right for both.

- **The server decodes params from anyone.** A caller need not be a mion client, so the server's
  params decoder is the only thing standing between an undeclared key and the handler. It has to
  rebuild the declared shape.
- **The client decodes a return the server itself wrote.** That is a different problem, so it is a
  different answer, and today it gets the same one.

The option name is the second half. `encoder` names one of the four things it decides, and it is the
only place in the codebase that says "encoder" at all: the response framing enum is `SerializerModes`,
the router module is `routes/serializer.routes.ts` and the client module is `lib/serializer.ts`.

## Decisions

Settled in review, not open for the implementer to re-litigate.

- **Keep the current premise.** The route (the server) names the strategy and the client deduces the
  compatible opposite. The client is never configured separately, because it is handed the compiled
  functions built from the same route type.
- **Keep `params` and `return` as the direction keys.** They map one-to-one onto a machine, verified
  in the code: `packages/router/src/dispatch.ts:273` decodes params on the server,
  `packages/router/src/routes/serializer.routes.ts` encodes the return on the server, and
  `packages/client/src/lib/serializer.ts:105` / `:221` encode params and decode the return on the
  client. So `params` means the client encodes and the server decodes, and `return` is the reverse.
- **Rename `encoder` to `serializer`**, on the router options, on route options and on middleFn
  options. `serializer?: never` is currently a retired key kept as a type error
  (`packages/router/src/types/general.ts:44`, `packages/router/src/types/remoteMethods.ts:81`); that
  retirement is undone. `EncoderOption`, `EncoderPair`, `ResolvedEncoder`, `EncoderLiteralGuard`,
  `DEFAULT_ENCODER` and `resolveEncoder` rename with it.
- **Keep the RunTypes words.** No new vocabulary for the strategies. The encoder words stay the
  run-types ones and any decoder the spec names uses the run-types decoder words, so nothing has to
  be translated between the two packages.
- **Drop `direct` from the mion router.** The router's strategies become
  `clone | mutate | compact`. `direct` stays in run-types, where `createJsonEncoderFn` keeps
  offering it; only mion stops exposing it. It was measured and it is worse on every axis that
  mattered (below), and it is the one strategy whose reach is chain-wide: a single middleFn using it
  reframes the whole response.

  ```ts
  // packages/router/src/lib/framing.ts:13, deleted with it
  if (method.hasReturnData && method.returnJitFns.json.strategy === 'direct') return SerializerModes.stringifyJson;
  ```

  `SerializerModes.stringifyJson` STAYS. It is also the REQUEST framing every platform adapter sets
  (`packages/platform-aws/src/awsLambda.ts:59` and its six siblings) and the client's own default
  (`packages/client/src/constants.ts:30`), neither of which has anything to do with `direct`.

  What goes is the RESPONSE side, where `direct` was the only thing that could select it:
  `getChainFraming` and its file, the `stringifyJson` arm of the response switch in all seven
  platform adapters, the two `json.strategy === 'direct'` branches in
  `packages/router/src/routes/serializer.routes.ts`, the one in
  `packages/client/src/lib/serializer.ts:106`, and the `encoder: 'direct'` on the internal route at
  `packages/router/src/routes/client.routes.ts:145`. A route response is then always a prepared
  value the platform stringifies. Its `direct` row leaves both decoder columns.
- **Split the decoder lookup in two**, one entry for the server side and one for the client side,
  replacing the single `DECODE_FAMILY_BY_STRATEGY`.
- **The client decoder always rebuilds the declared shape, unless the strategy is `compact`.** A
  caller of a mion client never sees a property its return type does not declare, whatever the server
  put on the wire and whatever version it is running.
- **The server params decoder rebuilds too, except under `mutate`**, whose whole point is passing the
  object through. `compact` has its own decoder on both sides.

That gives one entry per side:

```ts
// packages/core/src/constants.ts, replacing the single-entry map
export const DECODE_FAMILY_BY_STRATEGY = {
  clone:   {server: 'restoreFromJsonClone',  client: 'restoreFromJsonClone'},
  mutate:  {server: 'restoreFromJsonMutate', client: 'restoreFromJsonClone'},
  compact: {server: 'compactFromJson',       client: 'compactFromJson'},
} as const;
```

One row changes behaviour: a `mutate` return no longer hands the client keys the return type does
not declare. The server keeps passing them through on params, which is what the strategy is for. The
`direct` row is gone entirely, which also settles its old asymmetry (it dropped undeclared keys when
writing the wire and kept them when reading one).

The client column only ever holds two values, compact or clone, so it is a rule rather than a real
per-strategy choice. It stays in the table so both sides are read in one place.

### One correction that this rests on, stated plainly

The family named `mutate` does NOT remove undeclared keys. It is the opposite of what the name
suggests at first read.

```go
// ts-go-runtypes/internal/cachegen/typefunctions/json_restore_clone.go:8
// RestoreFromJsonCloneEmitter ... REBUILDS each object from the declared shape
// instead of transforming it where it sits, so a key the type does not declare
// is gone from the decoded value rather than left in place.
```

- `restoreFromJsonClone` (run-types `strip`) rebuilds from the declared shape and DROPS undeclared keys.
- `restoreFromJsonMutate` (run-types `preserve`) restores in place and KEEPS undeclared keys.

The names read backwards at a glance, which is how `direct` ended up pointed at the keeping decoder
in the first place. The table above is written against the behaviour, not the name.

## What was checked

- **`WireStrategy` carries encoder words only.** `packages/core/src/types/general.types.ts:17` aliases
  it straight to `JsonEncoderStrategy`, and the comment above it says "The decoder is implied". mion
  never surfaces `JsonDecoderStrategy` (`strip | preserve | compact`) anywhere.
- **`direct` was measured and it is not faster, and it costs far more memory.** A `Catalog` of
  40,000 products, ten fields each including a `Date` and a nested object, encoded to the same
  13.5 MB of JSON by every lane. Numbers stable across both orderings and across payload sizes.

  | lane | peak heap | ms per call |
  | --- | --- | --- |
  | `clone`, prepare + `JSON.stringify` (the router's path) | 22.1 MB | 75 |
  | `clone`, one-call encoder | 22.1 MB | 88 |
  | `direct` | 66.1 MB | 162 |

  Three times the memory and about twice the time. It builds the string by concatenation in JS,
  where the clone path hands a finished value to native `JSON.stringify`. The one thing it was
  supposed to buy, encoding without allocating a clone, it does not buy: the intermediate strings
  cost more than the clone did.
- **The decoder side welds two axes together, the same way the option does.** There are only two
  keyed decoders: rebuild-and-drop, or in-place-and-keep. "Restore in place AND drop undeclared keys"
  has no family. If the server params decoder should be both cheap and strict, that family has to be
  emitted, which is Go-side work, not a lookup change.
- **The runtime check assumes one decoder per strategy.**

  ```ts
  // packages/core/src/runtypes/mionAdapter.ts:228
  if (DECODE_FAMILY_BY_STRATEGY[strategy] !== decodeFamilies[0]) throw ...
  ```

  A route compiles one side's pair, so this has to learn which side it is verifying rather than
  comparing against a single expected decoder.
- **Two doc comments went stale before this spec was written.**
  `packages/run-types/src/createRTFunctions.ts:357` says `createJsonDecoderFn`'s `strip` "blanks keys
  instead of rebuilding" and `:390` says it "sets them to `undefined` before restore walks the
  declared shape". The Go emitter rebuilds, which is why `restoreFromJsonStrip` was renamed to
  `restoreFromJsonClone` in `da08eb8`. Both comments are fixed by this work.
- **There is already a guard to copy.** `EncoderLiteralGuard`
  (`packages/router/src/types/encoder.ts:81`) makes a widened or union value a type error at the call
  site, and `RouterOptionsArg` intersects it onto the factory argument. The renamed option keeps it.
- **Both ends read it from the type.** `ParamsStrategy` / `ReturnStrategy` feed the resolved-options
  view of the public API type (`packages/router/src/types/resolvedOptions.ts:34`), so the split has to
  resolve at the type level, not only at runtime.
- **It is public API.** `encoder` is documented and shipped, so whether `serializer` replaces it
  outright or rides beside it for a release is part of the work.

## Points left to the implementer

- Whether the two entries are keyed `server` / `client` as above or `params` / `return`. They are the
  same thing, since the direction decides the side.
- Whether the missing "in place and drop" decoder family is worth emitting, so a side that drops
  undeclared keys does not also pay the rebuild. Both columns above take the rebuild today.
- Whether `serializer` replaces `encoder` in one release or the old key is deprecated for one, and
  whether a route still writing `direct` gets a type error or falls back to `clone` for one release.
- Whether run-types renames `strip` / `preserve` to match the family names that already say `clone`
  and `mutate`, or keeps them as the lower-level words the router maps onto.
- The moot `strictTypes` signal. Under the split the condition is sayable in one line: it only does
  something when the server's params decoder keeps undeclared keys. Ship a build-time signal for the
  combination that cannot do anything, or write the condition down in the new vocabulary.

## Done when

- A reader can tell from the call site what happens to a property their type does not declare, on the
  server and on the client, without opening the framework.
- The server's params decoder and the client's return decoder are chosen separately, and the reason
  each one is what it is is written next to it.
- `direct` is gone from the router's strategies, along with the `stringifyJson` framing mode and its
  branches in the client and the response path. `createJsonEncoderFn` still offers it.
- A `mutate` return no longer reaches the client's caller carrying undeclared keys, with a test.
- A pairing that cannot round-trip is a type error, not a runtime surprise.
- The option is called `serializer` everywhere, and `encoder` is either gone or documented as the
  deprecated spelling.
- The serialization page on the website and the strategy doc comments in
  `packages/run-types/src/createRTFunctions.ts` describe the new shape, and the two stale `strip`
  comments named above are correct.
- The moot `strictTypes` question is answered: a signal shipped, or written down with its condition
  named in the new vocabulary.
