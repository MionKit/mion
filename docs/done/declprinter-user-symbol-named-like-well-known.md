---
type: fix
spec: guidelines
status: done
created: 2026-10-19
updated: 2026-10-30
---

# Declaration printer: a user unique symbol named like a well-known one prints as `Symbol.<name>`

## Evidence

The api-types declaration printer spelled a unique symbol by its name alone (`uniqueSymbolKey` in
`ts-go-runtypes/internal/convert/printdecl.go`). A name in a hardcoded `wellKnownSymbols` list always became
`Symbol.<name>`. So an outside package with

```ts
declare const iterator: unique symbol;
export type Tagged = { tag: typeof iterator; [iterator]: string };
```

printed `tag: typeof Symbol.iterator` and `[Symbol.iterator]: string`: a different type on the client. Held for both
symbol-keyed members and unique symbol types (`typeof sym`, which also reach the printer through `keyof string`).

Nothing caught it: the type id kept only the symbol's name (`typeid` `:sym:<name>`, member names `\xFE@<name>`), so
id parity passed. Fixing the printer alone could not work: `runtype.Cache` stores reflected trees by id, so two types
sharing an id share one tree.

## What shipped

- `typeid.StableMemberName` + `typeid.UniqueSymbolName` (`internal/cachegen/runtype/typeid/symbolkey.go`) spell the
  platform's own symbol `Symbol.<name>`, in the id, the reflected member name and the symbol literal. Platform = the
  checker's own key for that `SymbolConstructor` property (`getPropertyNameForKnownSymbolName`), no name list.
- A user `iterator` keeps `\xFE@iterator` / `:sym:iterator`, so it gets its own id and its own `declare const`.
- The printer prints a `Symbol.` name as is; the `wellKnownSymbols` list is gone.
- The two `stableMemberName` copies (serialize.go, typeid.go) merged into `typeid.StableMemberName`.
- The `Symbol.iterator` literal now carries its real description, `"Symbol.iterator"`.
- Ids change only for types holding a platform symbol. Ids are already salted with the mion version, and a disk cache
  entry under a changed id is a plain miss, so no `FormatVersion` bump.

## Tests

`TestDeclPrinter_UserSymbolNamedLikeAPlatformOneAsAKey` and `...AsATypeofType` (`internal/convert/printdecl_test.go`):
user `iterator` vs `Symbol.iterator`, printed text, id round trip and distinct ids. Both fail with a name-only match.
