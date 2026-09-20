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
- **The client decodes a return the server itself wrote.** Whatever the server's encoder put on the
  wire is exactly what arrives, so the client has nothing to defend against and can take the cheapest
  in-place restore.

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
- **Keep the RunTypes words.** No new vocabulary for the strategies. The encoder words stay
  `clone | mutate | direct | compact` and any decoder the spec names uses the run-types decoder
  words, so nothing has to be translated between the two packages.
- **Split the decoder lookup in two**, one entry for the server side and one for the client side,
  replacing the single `DECODE_FAMILY_BY_STRATEGY`.
- **The client decoder is the in-place restore unless the strategy is `compact`.** The input comes
  fresh out of `JSON.parse`, so restoring in place allocates nothing and mutates nothing the caller
  holds. It is also correct, because the server's own encoder already decided what is on the wire.
- **The server params decoder rebuilds the declared shape**, for every strategy except `compact`,
  which has its own decoder. This is what makes a strategy's "undeclared keys are dropped" promise
  hold for a payload mion did not write.

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

So "the client always takes the in-place restore" is safe because of the SERVER's encoder, not
because the client's decoder removes anything. The one hole is `serializer: 'mutate'` on the return
direction: that encoder deliberately sends undeclared keys, and an in-place client decoder keeps
them. The spec has to say whether that is the accepted behaviour of `mutate` (it is the strategy
whose whole point is passing the object through) or whether the client decoder drops on that one
strategy.

## What was checked

- **`WireStrategy` carries encoder words only.** `packages/core/src/types/general.types.ts:17` aliases
  it straight to `JsonEncoderStrategy`, and the comment above it says "The decoder is implied". mion
  never surfaces `JsonDecoderStrategy` (`strip | preserve | compact`) anywhere.
- **`direct` is asymmetric and it looks accidental.** Its encoder drops undeclared keys and its
  decoder keeps them, because it was pointed at the same entry as `mutate`. Nothing forces that
  pairing; `direct` is otherwise a faster `clone`.
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

- Whether the two decoder lookups are two maps or one map of pairs, and what they are called.
- Whether `direct` keeps its asymmetric decoder or is fixed to decode the way it encodes.
- Whether the missing "in place and drop" decoder family is worth emitting, or the server side simply
  takes the rebuilding decoder and the cost is accepted.
- Whether `serializer` replaces `encoder` in one release or the old key is deprecated for one.
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
- A pairing that cannot round-trip is a type error, not a runtime surprise.
- The option is called `serializer` everywhere, and `encoder` is either gone or documented as the
  deprecated spelling.
- The serialization page on the website and the strategy doc comments in
  `packages/run-types/src/createRTFunctions.ts` describe the new shape, and the two stale `strip`
  comments named above are correct.
- The moot `strictTypes` question is answered: a signal shipped, or written down with its condition
  named in the new vocabulary.
