---
type: fix
spec: guidelines
status: ready
created: 2026-10-19
---

# Declaration printer: a user unique symbol named like a well-known one prints as `Symbol.<name>`

## Evidence

The api-types declaration printer spells a unique symbol by its name alone (`uniqueSymbolKey` in
`ts-go-runtypes/internal/convert/printdecl.go`). A name in `wellKnownSymbols` always becomes `Symbol.<name>`.
So an outside package with

```ts
declare const iterator: unique symbol;
export type Tagged = { tag: typeof iterator; [iterator]: string };
```

prints `tag: typeof Symbol.iterator` and `[Symbol.iterator]: string`: a different type on the client. Holds for both
symbol-keyed members and unique symbol types (`typeof sym`, which also reach the printer through `keyof string`).

Nothing catches it: the type id keeps only the symbol's name (`typeid` `:sym:<name>`, member names `\xFE@<name>`), so
id parity passes and the package type-checks alone. The reflected literal `{"symbol": name}` cannot tell the two apart.

## Intent

Print the platform's `Symbol.<name>` only for the platform's symbol (declared as a property of `SymbolConstructor` in
a lib file). A user symbol with a clashing name gets its own `declare const` under a free name, or the use stays an
import with a warning. Decide whether the type id should tell them apart too (it is a shipped id: check
`ts-go-runtypes/internal/cachegen/runtype/typeid/AGENTS.md` first).

## Done when

- A paired test: user `iterator` vs `Symbol.iterator`, as a member key and as a `typeof` type, ids + types checked.
