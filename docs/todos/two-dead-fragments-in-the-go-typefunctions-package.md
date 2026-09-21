---
type: fix
spec: guidelines
status: ready
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
