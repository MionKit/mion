---
type: fix
spec: guidelines
status: ready
created: 2026-09-24
---

# The fnHash table lists variants no call can request

## Intent

`ts-go-runtypes/cmd/gen-fn-hashes/gen.go` `optionSubsets` builds the full power set of the validate
options. `numberMode: 'typeof'` (T) and `numberMode: 'notNaN'` (M) are one option with two values, so
they can never be set together. The table still gets every T+M combination: `NTM`, `NATM`, `NLTM`,
`NLATM` and their `C` twins, for each of the 6 validator families. That is 48 dead rows in
`packages/run-types/src/go-generated/fnHashes.generated.ts`, shipped on the `/runtime` subpath.

## Direction

The implementer plans the details. Make the subset walk skip combinations that pick more than one
value of the same option (see `NumberModeOptionName` in `internal/constants`), and check
`operations.optionSubsets`, which the generator says it mirrors, for the same issue. Regenerate with
`pnpm miondevx core codegen fnhashes`.

## Docs

None, because the table is generated and not documented row by row.

## Done when

- No T+M token remains in the generated table; a Go test pins that each option contributes at most one
  letter.
- `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm test` pass.
- The simplify-comments pass ran on every touched source file, committed on its own.
