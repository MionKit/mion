---
type: fix
spec: guidelines
status: done
created: 2026-09-21
---

# RTCode.ErrorMessage is written and never read

## Intent

[codetype.go](../../ts-go-runtypes/internal/cachegen/typefunctions/codetype.go) declared a field that
nothing read:

```go
// ErrorMessage is the runtime throw text set by RTThrow beside a CodeNS sentinel.
ErrorMessage string

func RTThrow(message string) RTCode {
    return RTCode{Code: "", Type: CodeNS, ErrorMessage: message}
}
```

A search over the whole tree found three mentions: the doc line, the declaration, and that one write.
No reader anywhere. The runtime throw text a consumer actually sees comes from
`buildAlwaysThrowMessage` (see `alwaysthrow_message.go` and `module.go`'s `renderAlwaysThrowEntry`),
not from this field.

## What shipped

The call sites settled it, and the dead chain turned out to be three links, not one:

- `RTCode.ErrorMessage` was written only by `RTThrow`.
- `RTThrow` was called only by `EmitContext.RTThrowDiag`.
- `RTThrowDiag` had **zero** call sites in the tree.

Every emitter that reaches an unsupported kind returns the bare sentinel
`RTCode{Code: "", Type: CodeNS}` directly (over a hundred sites in `binary_from.go`, `binary_to.go`,
`validationerrors.go`, …). The build-time diagnostic and the runtime throw text are both produced at
the ROOT instead: `module.go`'s unsupported branch resolves the leaf's per-family code via
`LeafDiagCodeProvider.DiagCodeForLeaf`, calls `walker.EmitDiagnostic(diagCode, kindLabel)` and renders
the message with `buildAlwaysThrowMessage`. So `buildAlwaysThrowMessage` fully replaced the field, and
no message is lost today: nothing ever passed one.

Deleted, all in `internal/cachegen/typefunctions/`:

- the `ErrorMessage` field and its stale doc paragraph (`codetype.go`)
- `RTThrow` (`codetype.go`)
- `EmitContext.RTThrowDiag` (`emitter.go`)

The comments that named `RTThrow` as a site kind now say "root-throw" (`module.go`, `render.go`,
`dispatch.go`), and the two `TestDiag_RunTypeRTThrow_*` tests are renamed `TestDiag_RunTypeRootThrow_*`.

No behaviour change: the emitted cache entries are byte-identical, because the deleted code was never
reached.

## Test

`codetype_test.go` — `TestRTCode_HasNoThrowMessageChannel` pins `RTCode`'s field set to
`{Code, Type}`. A per-site message field has no reader and would silently diverge from the text
`module.go` renders, so the test fails if one comes back.

The root path itself was already pinned and stays green:
`TestDiag_AlwaysThrowEntry_EmbedsRenderedMessage`, `TestBuildAlwaysThrowMessage_WithProvenance`,
`TestRootThrowHeadline_PerFamily`, and the `module_test.go` alwaysThrow rows.

## Evidence

- `grep -rn ErrorMessage` over the tree (Go, TS, generated JS, JSON) returns no reader: only the
  declaration, the one write, and unrelated `string_customErrorMessage` benchmark cases.
- `go -C ts-go-runtypes test ./internal/... ./cmd/...` green.
- `go -C ts-go-runtypes vet ./internal/... ./cmd/...` clean.

## Docs

None. The deleted code is internal to the Go resolver and produces no user-facing change.

## Origin

Split out of a spec covering three dead fragments in this package. Two of them shipped (the
`unevalIdentityChainMaxKeys` constant and the no-op branch in `binary_from.go`); this third one was
added to the spec after the implementing session had already taken its copy, so it was never picked
up.
