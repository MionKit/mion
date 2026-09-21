---
type: fix
spec: guidelines
status: ready
created: 2026-09-21
---

# RTCode.ErrorMessage is written and never read

## Intent

[codetype.go](../../ts-go-runtypes/internal/cachegen/typefunctions/codetype.go) declares a field that
nothing reads:

```go
// ErrorMessage is the runtime throw text set by RTThrow beside a CodeNS sentinel.
ErrorMessage string

func RTThrow(message string) RTCode {
    return RTCode{Code: "", Type: CodeNS, ErrorMessage: message}
}
```

A search over the whole tree finds three mentions: the doc line, the declaration, and that one write.
No reader anywhere. The runtime throw text a consumer actually sees comes from
`buildAlwaysThrowMessage` (see `alwaysthrow_message.go` and `module.go`'s `renderAlwaysThrowEntry`),
not from this field.

Its doc used to describe a mechanism that does not exist at all: it claimed the walker latches the
value onto a `Walker.ThrowMessage` field and that `module.go` emits a `function(utl){ throw ... }`
factory from it. There is no `Walker.ThrowMessage` anywhere. That wording is already corrected; the
field is what is left.

## What to settle

Read every `RTThrow` call site first, then pick one:

- If the messages those callers pass were meant to reach the emitted output, the wiring is missing
  and this is a behaviour gap, not dead code. Wire it, or make `RTThrow` stop accepting a message it
  discards.
- If `buildAlwaysThrowMessage` fully replaced it, drop the field and simplify `RTThrow` to take no
  message.

The second is the likely answer, but the call sites decide it, not the field.

## Evidence to produce

- The search proving no reader exists, generated code included.
- Whichever way it goes: `go -C ts-go-runtypes test ./internal/... ./cmd/...` green and `go vet`
  clean. If a `RTThrow` message turns out to be lost today, a test that pins what the emitted entry
  throws.

## Watch out

- `RTThrow` returns a `CodeNS` sentinel, and `CodeNS` escalates to the root, where `module.go` renders
  an alwaysThrow factory. Check that path before concluding the message is simply unused.

## Origin

Split out of a spec covering three dead fragments in this package. Two of them shipped (the
`unevalIdentityChainMaxKeys` constant and the no-op branch in `binary_from.go`); this third one was
added to the spec after the implementing session had already taken its copy, so it was never picked
up.
