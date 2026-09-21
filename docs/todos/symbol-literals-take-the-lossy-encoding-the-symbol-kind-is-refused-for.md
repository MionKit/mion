---
type: fix
spec: guidelines
status: ready
created: 2026-09-21
---

# Symbol literals take the lossy encoding the symbol kind is refused for

## Intent

The JSON emitters refuse a bare symbol, and say why:

```go
case reflection.KindSymbol:
    // Unsupported — symbol identity does not survive a JSON round-trip
    // (Symbol("x") !== Symbol("x")), so a description-only encoding is lossy by construction.
    return RTCode{Code: "", Type: CodeNS}
```

A symbol LITERAL takes exactly that description-only encoding
([json_prepare.go](../../ts-go-runtypes/internal/cachegen/typefunctions/json_prepare.go)):

```go
case litSymbol:
    return RTCode{Code: v + " = 'Symbol:' + (" + v + ".description || '')", Type: CodeE}
```

and the restore arm rebuilds it with a fresh `Symbol()`
([json_restore.go](../../ts-go-runtypes/internal/cachegen/typefunctions/json_restore.go)):

```go
case litSymbol:
    return RTCode{Code: v + " = typeof " + v + " === 'string' && " + v + ".startsWith('Symbol:') ? Symbol(" + v + ".substring(7)) : " + v, Type: CodeE}
```

`Symbol('x') !== Symbol('x')`, so the round trip does not return the value it was given. That is the
same lossiness cited as the reason to refuse the bare kind. The literal arm appears in
`emitLiteralPrepareForJson`, `emitLiteralPrepareForJsonClone` and `emitLiteralStringifyJson`.

## What to settle

Pick one and make the code and its comments agree:

1. **A literal symbol is recoverable and the encoding should say so.** A symbol literal type names one
   specific symbol, so a registered symbol could round-trip through `Symbol.for`. If that is the
   intent, the encode and restore arms should use the registry, and the comment should state that a
   literal is exempt from the bare-kind rule BECAUSE the type names the symbol.
   Note `Symbol.for` and `Symbol()` are different symbols, so switching is a wire-behaviour change,
   not a refactor.
2. **A literal symbol is not recoverable either.** Then it should be refused the same way the bare
   kind is, with the same diagnostic, and the three literal arms go.

Option 1 is the bigger change and only works for registry symbols; a symbol from `Symbol('x')` in
user code is not in the registry and cannot be recovered at all. Work out which kinds of symbol can
actually reach a literal type here before choosing.

## Evidence to produce

- A round-trip test over a symbol literal asserting what comes back today, so the current behaviour
  is recorded before it changes.
- Whichever option wins: the `GC-GUARD` generated-code oracle and the Go tests
  (`go -C ts-go-runtypes test ./internal/... ./cmd/...`) green.
- If the answer is to refuse: check nothing in `packages/` relies on a symbol literal surviving a
  round trip, and give the refusal a diagnostic code the catalog already has or a new one added the
  normal way.

## Watch out

- Decode runs BEFORE validate, so a restore arm must convert only the exact wire form and leave
  anything else for validate. Whatever replaces the current arm keeps that rule; the existing arm
  already guards on the `'Symbol:'` prefix and must not lose that guard.
- The three encode arms and the one restore arm must stay symmetric, or the round trip breaks
  silently.

## Origin

Found during a repo-wide comment simplification pass, by reading the bare-kind refusal comment
against the literal arm a hundred lines below it.
