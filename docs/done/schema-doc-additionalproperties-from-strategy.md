---
type: feature
spec: guidelines
status: done
created: 2026-08-17
---

# Emit `additionalProperties` from the chosen encoding strategy

## Problem

Since the JSON Schema input removal
(`docs/done/remove-json-schema-input.md`), closedness has no authoring
surface: `additionalProperties: false` cannot be written anywhere, and the
emitted schema documents (`createJsonSchemaFn` / the `jsc` cache family)
never state it — even though the runtime pipeline DOES have a defined
behavior for unknown keys.

## Decision (recorded 2026-08-17)

**There will be NO `additionalProperties` structural param.** The direction
is the reverse: the emitted document derives `additionalProperties` from the
chosen ENCODING STRATEGY, because the strategies already define how unknown
keys are treated:

- the `clone` JSON encoder strips extras at encode (shape-derived), and the
  `strip` decoder drops unknown keys on read — the wire produced/accepted by
  that pairing carries ONLY the declared keys;
- the `mutate` / `direct` encoders and the `preserve` decoder let extras
  ride through.

A schema document describes a wire, and the wire's key policy is the
strategy's, so `additionalProperties` must be derived FROM the strategy —
never authored as an independent param that could contradict it (the silent
always-reject footgun the derived-only `closed` / `closedPatterns` params
already guard against, see
[packages/ts-runtypes/src/formats/structural.ts](../../packages/ts-runtypes/src/formats/structural.ts)).

## Direction to work out

- Where the strategy meets the document: the `jsc` entry is rendered at
  build time per TYPE, while the strategy is chosen per FACTORY
  (`createJsonEncoderFn<T>(undefined, {strategy: 'clone'})`). Either the
  runtime converter (`packages/ts-runtypes/src/standard/jsonSchemaDoc.ts`,
  which already post-processes `portable`) stamps `additionalProperties`
  onto object nodes from a strategy passed through
  `StandardJSONSchemaOptions` / the factory's own knowledge, or the `jsc`
  family emits per-strategy variants. The runtime stamp looks like the
  cheaper path and mirrors how `portable` works today.
- `input()` vs `output()` documents may differ: a strip-decoding consumer
  ACCEPTS extras (then drops them), while a clone-encoded producer never
  EMITS them — decide which side says `additionalProperties: false`
  (2020-12 semantics: `false` means a document with an extra key is
  INVALID, which matches the producer story, not the tolerant-reader
  story).
- The website's schema-generation guide
  (`container/website/content/02.guide/14.json-schema-generation.md`)
  documents whatever ships.

## Out of scope

- Any new structural param or authoring surface for closedness.
- Changing what the codecs themselves do with unknown keys.

## Shipped (2026-08-17)

Implemented as the runtime stamp (the `portable`-style post-process):

- `libraryOptions.encoderStrategy` on the schema options
  ([packages/ts-runtypes/src/standard/jsonSchemaDoc.ts](../../packages/ts-runtypes/src/standard/jsonSchemaDoc.ts)):
  `'clone'` / `'direct'` deep-stamp `additionalProperties: false` onto every
  KEYED object node (`type: 'object'` with declared `properties` and no
  `additionalProperties` of its own); `'mutate'` leaves the document open;
  `'compact'` throws a RangeError (its wire is positional arrays the keyed
  document does not describe); an unknown value throws rather than silently
  returning an open document. Records keep the index schema their
  `additionalProperties` already carries, and the bare `object` keyword is
  never closed (that would read as "no keys at all"). The stamp runs before
  the portable strip, so a portable closed document keeps it.
- The input()/output() deliberation resolved to the module's one-document
  doctrine: the option is an explicit caller declaration of the paired
  encoder's wire, and the one shared document reflects it on whichever side
  reads it (`createJsonSchemaFn` only exposes the input side, so a split
  would have made the stamp unreachable from the standalone factory).
- Pinned by
  [packages/ts-runtypes/test/features/jsonSchemaClosedness.test.ts](../../packages/ts-runtypes/test/features/jsonSchemaClosedness.test.ts)
  (12 cases: default open, clone/direct closed incl. nested, mutate open,
  record untouched, bare object untouched, portable composition, compact +
  unknown-value refusals, both converter sides, static/value-first and
  static/reflection pairs).
- Documented in the website guide
  (`container/website/content/02.guide/14.json-schema-generation.md`,
  "Closed objects follow the encoder") with a compiled example region.
