---
type: feature
spec: guidelines
status: maybe
created: 2026-08-30
---

# Binary as data, under binary serialization only

## Intent

`Buffer`, the typed arrays, `ArrayBuffer` and `DataView` are real data. They are simply not JSON
data.

Today they are stripped for every family. That is right for the JSON families, where there is no
honest representation short of base64 or a number array, and both change the shape. It is wrong
for binary serialization, where bytes are the entire point: a consumer encoding a
`{id: number; payload: Uint8Array}` to the wire with `createBinaryEncoderFn` gets a validator and
an encoder that silently drop the payload, which is the one field they cared about.

The asymmetry is the whole idea: a JSON validator should still refuse it, a binary one should not.

## Direction

Investigate supporting the binary family as DATA, but only under binary serialization, and only as
something the consumer asks for explicitly rather than a default that changes what existing builds
emit.

Points the investigation has to land:

- **What the opt-in looks like.** A tsconfig plugin knob, a per-call option, or a marker on the
  type. Whatever it is, it has to reach the Go side, since the projection is where the drop
  happens. Note that the projection is currently family-independent: one `RunType` tree feeds every
  emitter, so "data for `toBinary`, not for `prepareForJson`" is a real design question and not
  just a flag.
- **Which types.** The recognition already exists and needs no list: the `ArrayBufferView` member
  shape covers every typed array, `DataView`, Node's `Buffer` and any subclass, and
  `BinaryRootBaseOf` covers the raw buffers. Reuse them rather than naming anything.
- **What the wire format is.** Length-prefixed bytes presumably, but decide it, and decide what
  the decoder hands back (a `Uint8Array` view, an owned copy, the original class).
- **What `DataOnly<T>` does under the opt-in.** The two projections must agree or the divergence
  is back. `DataOnlyStripped`'s `ArrayBuffer | SharedArrayBuffer | ArrayBufferView` arm is what
  would have to become conditional, and TypeScript has no notion of "which family is being
  generated", so this is the hardest part and worth deciding first.
- **What the JSON families do when the opt-in is on.** They must keep refusing, and keep saying so
  with the existing `…015` / `…001` diagnostics, or a consumer will assume the opt-in was global.

Background on why the set is closed and how binary is recognised:
[docs/done/consumer-lib-version-contract.md](../done/consumer-lib-version-contract.md).

The implementer plans the details.

## Done when

There is a decision on the opt-in shape and the `DataOnly<T>` half, with enough detail to build
from, or a written case that it is not worth doing.
