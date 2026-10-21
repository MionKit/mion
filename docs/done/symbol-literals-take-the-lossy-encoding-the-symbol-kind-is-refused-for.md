---
type: fix
spec: guidelines
status: done
created: 2026-09-21
updated: 2026-09-21
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

## Plan — refuse it, option 2 (approved 2026-09-21)

### The answer to "what to settle"

**Option 2.** A literal symbol is not recoverable either, and the reflection layer cannot
make option 1 work.

`serialize.go`'s `UniqueESSymbol` arm stores only the description:

```go
node.Literal = map[string]any{"symbol": uniqueSymbolDescription(tsType)}
node.Flags = append(node.Flags, "symbol")
```

`uniqueSymbolDescription` reads `callExpression.Arguments` and never looks at the callee, so
`Symbol.for('x')` and `Symbol('x')` record the identical `{"symbol": "x"}`. The registry-versus-not
distinction is gone by the time any emitter sees the type, and an unconditional `Symbol.for` would
mint registry symbols for non-registry ones while still not returning the original value. Option 1
is not implementable without a new resolver field, and would only ever cover
`const s: unique symbol = Symbol.for('x')`.

Two things already said a symbol literal is not data, and only the encoders disagreed:

- `DataOnly<typeof sym>` is `never`, because `type DataOnlyStripped = | symbol | ...`
  (`packages/run-types/src/runtypes/dataOnly.ts`) and a unique symbol is assignable to `symbol`.
  So `DataOnly<{a: typeof sym}>` was `{}` while the encoder wrote `{"a":"Symbol:hello"}`.
- `validate.go`'s `emitLiteralBaseKind` already refused a symbol literal under the `noLiterals`
  variant, and `clone_exact_shape.go` already dropped a symbol-literal property.

### What shipped

A symbol literal is now treated as a DataOnly-stripped kind, exactly like the bare `symbol`:
dropped at a property with the …015 Warning, dropped as a union member, and an alwaysThrow factory
at a root or any other propagating slot. Nothing is written and nothing is parsed.

The four `case litSymbol:` arms return the unsupported sentinel:

| File | Was | Is |
| --- | --- | --- |
| `json_prepare.go` | `v = 'Symbol:' + (v.description \|\| '')` | `CodeNS` |
| `json_prepare_clone.go` | `'Symbol:' + (v.description \|\| '')` | `CodeNS` |
| `json_stringify.go` | `JSON.stringify('Symbol:'+(v.description\|\|''))` | `CodeNS` |
| `json_restore.go` | `typeof v === 'string' && v.startsWith('Symbol:') ? Symbol(v.substring(7)) : v` | `CodeNS` |

`json_compact.go` and `json_compact_restore.go` delegate to those, so compact and the
`restoreFromJsonClone` road followed with no edit.

Binary carried the same hole by a different route and is fixed too, which the Watch-out section did
not anticipate: `binary_from.go` rebuilt `ret = Symbol("<name>")` from the TYPE (not the wire), and
`binary_to.go`'s `emitLiteralToBinary` was a blanket noop for every flavour. Both now refuse, and
the binary noop predicate in `noop_types.go` carves the symbol flavour out of "every literal is
free".

The piece that makes a property DROP rather than vanish silently is one arm in
`isStrippedUnionMember` (`union_strip.go`):

```go
case reflection.KindLiteral:
    return literalFlavour(resolved) == litSymbol
```

Without it `strippedPropertyDrop` answered false, the property compiled, returned `CodeNS`, and
`propertyChildFailed` ABSORBED it with no diagnostic at all. That helper's contract is to mirror
`dataOnly.ts`'s stripped set, which already listed `symbol`, so this corrects the mirror.

Supporting edits:

- `module.go`'s `leafKindLabel` says `Symbol` for a symbol-flagged literal instead of
  `Unsupported`. The throw message read ``Type `Unsupported` can never be encoded`` before; that
  also fixes the existing `noLiterals` validate path, which had the same wrong label.
- `reflection.MustValidateJson` no longer lists the symbol literal. No decoder converts a symbol
  from the wire, so there is nothing left to guard.
- `diag_codes.go`'s `KindLiteral` arm applies to every family now, not only the `noLiterals`
  validate variant.

**No new diagnostic code.** `PJ005` / `PJS005` / `SJ005` / `RJ005` / `TB006` / `FB006` were already
registered, and `diag_codes.go` already routed a symbol-flagged literal to them.

### What did NOT change

`validate` and `getValidationErrors` keep the root description check
(`typeof v === 'symbol' && v.description === 'hello'`). Nothing crosses the wire there, so an
in-memory value is still checkable. The divergence from `DataOnly` at that one position is the one
already recorded as `dataOnlyDivergent: true` in the validation suite.

A symbol-literal PROPERTY and a symbol-literal UNION MEMBER do now drop for the validators as well,
because `strippedPropertyDrop` and `isStrippedUnionMember` are shared across every family. That is
what `DataOnly` always said those positions projected to, so validate moved onto the contract it is
defined against rather than away from it.

### Evidence produced

The round-trip test the spec asked for landed FIRST, as its own commit
(`test(run-types): record the lossy symbol literal wire behaviour`), asserting what came back
before the change: a symbol with the right description that `!== sym`, on JSON and on binary, and
accepted by the validator. The fix commit rewrote that file into the refusal assertions, so the
git history carries both.

Nothing in `packages/` relied on a symbol literal surviving a round trip. There was no Vitest
round-trip case for one, and the reason is recorded: two `Symbol('x')` instances are never equal,
so such an assertion could never have passed.

### Tests

Go, `ts-go-runtypes/internal/cachegen/typefunctions/symbol_literal_not_data_test.go`: root refusal
on all seven serialization families with the per-family code and the `Symbol` label, no wire form
emitted anywhere, the property drop with its Warning severity, the `Date | typeof sym` union drop,
and validate keeping its description check.

Flipped: `TestPrepareForJsonClone_ArrayOfSymbolLiteral` now asserts refusal, and
`TestMustValidateJson_SymbolLiteralOnlyFromItsWireForm` became
`TestMustValidateJson_SymbolLiteralHasNoWireForm`, which also feeds the symbol literal through the
"a transform only appears under a flagged kind" sweep. Two fixtures were corrected to the canonical
`Literal: map[string]any{"symbol": …}` shape the resolver actually emits.

Vitest: `packages/run-types/test/features/symbolLiteralWire.test.ts` (root refusal per strategy,
property drop, binary, union) and a `literal_symbol` case in
`packages/run-types/test/suites/serialization/Atomic.ts` mirroring the bare `symbol` case.

The typechecker proved the point on its own: `decoded.tag` stopped compiling, because
`DataOnly<HasSymLiteral>` is `{name: string}`. The emitted code and the declared type now agree.

Not a fuzz candidate: the change removes a transform, and a symbol round trip can never be asserted
equal in the first place.

### Docs

`02.guide/11.decoding-untrusted-input.md` lost the `a symbol literal | its Symbol: string form` row
from "Wire Forms That Convert", which was the one published promise, and gained a note beside the
RegExp one.

Two more pages were wrong on this topic and are fixed here: `04.articles/01.binary-serialization.md`
listed `sym: symbol; // Description as string` among the primitive encodings, which was already
false (binary refused the bare kind), and two pages said "symbol keys are dropped" when symbol
VALUES are dropped too.

### Reverses an earlier decision

`clone-encoder-throws-on-bigint-literals.md` deliberately declined to remove symbol-literal support,
on the grounds that they were "deliberately supported everywhere else". That reading was correct
about the code and wrong about the contract: `DataOnly` had already stripped them, so "everywhere
else" was itself the inconsistency.
