---
type: fix
spec: guidelines
status: ready
created: 2026-09-21
---

# Three dead fragments in the Go typefunctions package

## Intent

A repo-wide comment pass read every comment in
`ts-go-runtypes/internal/cachegen/typefunctions/` against the code under it. Three pieces of that code
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

### A field nothing reads

[codetype.go](../../ts-go-runtypes/internal/cachegen/typefunctions/codetype.go):

```go
ErrorMessage string
...
func RTThrow(message string) RTCode {
    return RTCode{Code: "", Type: CodeNS, ErrorMessage: message}
}
```

`ErrorMessage` is written by `RTThrow` and read nowhere. The runtime throw text a consumer sees comes
from `buildAlwaysThrowMessage`, not from this field.

Its doc used to describe a mechanism that does not exist: it said the walker latches the value onto a
`Walker.ThrowMessage` field and that `module.go` emits a `function(utl){ throw ... }` factory from it.
There is no `Walker.ThrowMessage` anywhere. That wording has been corrected already; the field is what
is left.

## What to settle

For each, work out whether it is a leftover or an unfinished intent, then remove it or finish it.

- The constant: if `unevaluatedProperties` support is planned, say so in the spec that plans it, not
  in a constant nobody reads. Otherwise delete the constant and its comment.
- The field: read every `RTThrow` call site first. If the messages those callers pass were meant to
  reach the emitted output, the wiring is missing and that is a behaviour gap, not dead code. If
  `buildAlwaysThrowMessage` fully replaced it, drop the field and simplify `RTThrow`.
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
