---
type: fix
spec: guidelines
status: done
created: 2026-09-21
---

# Two dead fragments in the Go typefunctions package

## Intent

A repo-wide comment pass read every comment in
`ts-go-runtypes/internal/cachegen/typefunctions/` against the code under it. Two pieces of that code
turned out to do nothing.

### A constant nothing reads

[validate.go](../../ts-go-runtypes/internal/cachegen/typefunctions/validate.go) declares:

```go
const unevalIdentityChainMaxKeys = 8
```

`grep` over the whole tree finds exactly one occurrence, its own declaration. Go does not report an
unused constant, so nothing has ever failed because of it.

Its comment points at `identityChainMaxKeys` in
`internal/cachegen/typefunctions/formats/structural/objectformat.go`, which does exist and does hold
the same value 8. The name refers to `unevaluatedProperties`, a JSON Schema keyword with no other
trace in this package.

### A branch that cannot change anything

[binary_from.go](../../ts-go-runtypes/internal/cachegen/typefunctions/binary_from.go), around line
385:

```go
body := innerRT.Code
if body == "" {
    body = ""
}
```

The branch assigns `body` the value it already has.

## What to settle

For each, work out whether it is a leftover or an unfinished intent, then remove it or finish it.

- The constant: if `unevaluatedProperties` support is planned, say so in the spec that plans it, not
  in a constant nobody reads. Otherwise delete the constant and its comment.
- The branch: read the surrounding emit to see what the author meant to guard. An empty `innerRT.Code`
  probably needs a real fallback (a `CodeNS` sentinel, a skip, or an explicit empty statement), or
  nothing at all. Decide which, then either write the real guard or delete the three lines.

Do not delete the branch without looking at what an empty `innerRT.Code` means for the emitted
decoder. A missing member body in a positional binary decoder misaligns everything after it, so
"does nothing today" and "is safe to drop" are different claims here.

## Evidence to produce

- The search proving the constant is unreferenced, generated code included.
- For the branch: a statement of what an empty `innerRT.Code` produces in the emitted output, and a
  test if the answer is that it should not happen.
- `go -C ts-go-runtypes test ./internal/... ./cmd/...` green, and `go vet` clean.

## Watch out

- The binary encoder and decoder must stay byte-symmetric. Anything that changes what the decoder
  emits needs the round-trip tests, not just a compile.

## Origin

Found during a repo-wide comment simplification pass, by reading the code each comment sits on.
Neither fragment was introduced by that pass.

## What shipped (2026-09-21)

Both fragments were leftovers. Both are gone, and the second one is now pinned by tests.

### The constant: deleted

`grep -rn unevalIdentityChainMaxKeys` over the whole tree, generated output included, returned
exactly two hits: the declaration itself and this document. Nothing reads it.

The constant it mirrors is alive and used, so only the dead copy went:
`formats/structural/objectformat.go:22` declares `identityChainMaxKeys = 8`, read at
`objectformat.go:119` and covered by `objectformat_test.go:141`.

`unevaluatedProperties` is not planned. Its only other trace in the tree is a past-tense note in
`internal/convert/print.go` saying the `unevaluated*` slots "once slipped through", so the feature
was removed, not scheduled. The constant and its three comment lines were deleted from
`validate.go`.

### The branch: deleted, after proving the empty body is already correct

An empty `innerRT.Code` is a real case, not an impossible one. It happens when an optional
property's value compiles to `CodeNS` and `propertyChildFailed` (`union_strip.go`) absorbs it,
which resets the compiled child to empty `CodeS` a few lines earlier in the same loop.

It does not misalign the stream, because the encoder does the same thing. Optional properties ride
a presence bitmap written up front, not inline, so an empty body reads zero value bytes and the
matching encoder writes zero value bytes. Rendering `{a?: X; b?: string; c?: number}` where `X` is
a kind with no binary emit gives:

```js
// decoder
ret = {};
const bmI0 = Des.index++;
if ((Des.view.getUint8(bmI0 + 0) & 1)) {}
if ((Des.view.getUint8(bmI0 + 0) & 2)) {ret.b = Des.desString();}
if ((Des.view.getUint8(bmI0 + 0) & 4)) {ret.c = Des.view.getFloat64(Des.index, 1, (Des.index += 8));}

// encoder
const bmI0 = Ser.index; Ser.ensureCapacity?.(1); Ser.view.setUint8(Ser.index++, 0);
if (v.a !== undefined) {Ser.setBitMask(bmI0, 0)}
if (v.b !== undefined) {Ser.serString(v.b);Ser.setBitMask(bmI0, 1)}
if (v.c !== undefined) {(...);Ser.setBitMask(bmI0, 2)}
```

`a`'s bit is reserved and set on both sides, no bytes move, and `b` and `c` keep masks 2 and 4. The
property simply drops from the decoded object, which is what the existing comment above the loop
already claimed.

So the three lines went and the emit stayed byte-identical (the deleted branch assigned `body` the
value it already held), which also matches the tuple sibling in the same file, already written
without a branch.

### Test

New file `ts-go-runtypes/internal/cachegen/typefunctions/binary_optional_empty_body_test.go`, two
tests over the fixture above:

- the decoder emits an empty-bodied bit-0 check, and `b` / `c` still decode under masks 2 and 4,
- the encoder sets bit 0 for the absorbed member and writes no value bytes.

That turns "what does an empty compiled child produce" into something that cannot change silently.

### Not done, on purpose

- No round-trip test was added: the generated output is unchanged by construction, so the existing
  binary round-trip coverage already applies.
- No docs: both fragments are internal Go code with no user-visible behaviour.
- No fuzz suite: nothing about the emitted output changed, so a property test would only re-exercise
  the existing binary oracle.
