---
type: fix
spec: guidelines
status: ready
created: 2026-09-17
---

# One `encoder` name quietly decides the decoder too, and the names do not say so

## Intent

A route writes one option, `encoder`, and it settles four separate things: how the params are
encoded, how the params are decoded, how the return is encoded and how the return is decoded. The
four names only describe the encoding half, so the decoding half is unreadable from the call site.

```ts
// packages/core/src/constants.ts
export const ENCODE_FAMILY_BY_STRATEGY = {clone: 'pjs', mutate: 'pj', direct: 'sj', compact: 'cj'};
export const DECODE_FAMILY_BY_STRATEGY = {clone: 'rjs', mutate: 'rj', direct: 'rj', compact: 'cjr'};
```

Three things do not add up.

- **The four names sit on different axes.** `clone` and `mutate` say whether the encoder allocates a
  new value. `direct` says the encoder writes the JSON text in one pass. `compact` says the WIRE is
  positional. Only the last one is about something both ends share.
- **Two names describe one decoder.** `mutate` and `direct` differ on encode and are identical on
  decode.
- **The thing people actually ask about is not in any name.** Whether an undeclared property reaches
  the handler follows from the decode family, which the name never mentions. Today that answer is
  yes for `mutate` and `direct` and no for `clone` and `compact`, and nothing about the words says so.

The per-direction spelling adds to it. `encoder: {params: …, return: …}` reads as though the two keys
were encode and decode. They are directions, and each one still silently carries both halves.

So the option should be one of two shapes, and this spec is to pick one and do it:

- **One name that genuinely describes both ends**, encode and decode together, so the word is a
  promise about the route rather than about one direction of it.
- **Two options, and no strategy word at all**: name the encoder and name the decoder.

## Direction

What was checked:

- **The underlying library already separates them, with different vocabularies.**
  `packages/run-types/src/createRTFunctions.ts` declares
  `JsonEncoderStrategy = 'clone' | 'mutate' | 'direct' | 'compact'` and
  `JsonDecoderStrategy = 'strip' | 'preserve' | 'compact'`, taken by `createJsonEncoderFn` and
  `createJsonDecoderFn` as two independent options. The router collapses that two-axis thing onto one
  axis and renames it on the way. That is the strongest single argument for the two-option shape, and
  the mismatch between the two vocabularies is worth looking at on its own.
- **The wire is shape-coupled, so a free pair can spell nonsense.** A `compact` encode only decodes
  with a `compact` decode. Two independent options must therefore still refuse the combinations that
  cannot round-trip, which is a real constraint on the second shape and an argument for the first.
- **There is already a guard to copy.** `EncoderLiteralGuard` in
  `packages/router/src/types/encoder.ts` makes a widened or union `encoder` a type error at the call
  site. Whatever shape wins needs the same treatment.
- **Both ends read it from the type.** The client builds its own call from the same route type
  (`ParamsStrategy` / `ReturnStrategy` are exported for the resolved-options view of the public API
  type), so the new shape has to resolve at the type level, not only at runtime.
- **It is public API.** `encoder` is documented and shipped, so whether the new shape replaces it or
  rides beside it for a release is part of the decision, not an afterthought.

The implementer plans the rest. Points to settle rather than assume:

- Which of the two shapes, and what the words are. If one name keeps covering both ends, it should
  say what a caller's undeclared property does, since that is the question the current names dodge.
- How a combination that cannot round-trip is refused, at the type level and at `initRoutes`.
- Whether the router's vocabulary and the run-types one become the same words.
- Whether a route that sets `strictTypes` where the decoder already drops undeclared keys gets a
  build-time signal. It is dead configuration today with nothing saying so, and the condition can
  only be named once the option shape is settled, so it rides with this work rather than ahead of it.

## Done when

- A reader can tell from the call site what happens to a property their type does not declare, on
  both directions, without opening the framework.
- A pairing that cannot round-trip is a type error, not a runtime surprise.
- The serialization page on the website and the strategy doc comments in
  `packages/run-types/src/createRTFunctions.ts` describe the new shape, and the old one is either
  gone or documented as the deprecated spelling.
- The moot-`strictTypes` question is answered: a signal shipped, or written down with its condition
  named in the new vocabulary.
