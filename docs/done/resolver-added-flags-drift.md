---
type: fix
spec: guidelines
status: done
created: 2026-09-24
---

# Resolver per-family `added*` flags: name drift and no reader

## Intent

The Go resolver's scan response carries one "did this scan add something for this family" flag per family (`AddedValidate`, `AddedPrepareForJsonClone`, `AddedStripUnknownKeysWire`, ... in `ts-go-runtypes/internal/protocol/protocol.go`). The devtools mirror of that response (`packages/devtools/src/core/protocol.ts` and the result mapping in `packages/devtools/src/core/resolver-client.ts`) has drifted:

- Two names do not match the wire: TS reads `addedPrepareForJsonSafe` and `addedUnknownKeysToUndefinedWire`, Go writes `addedPrepareForJsonClone` and `addedStripUnknownKeysWire`, so both TS fields are always `undefined`.
- Nothing reads the per-family flags at all: `unplugin.ts` only checks `addedRunTypes` and `addedPureFns`. The comments still say "the Vite plugin invalidates each cache module off its own flag".

Found while removing `createHasUnknownKeysFn` / `createUnknownKeyErrorsFn`, whose two flags were part of that list.

## Direction

The implementer plans the details. Decide whether per-family invalidation is still wanted:

- If not, remove the per-family flags from Go (`protocol.go` fields, the `setAdded` wiring in `internal/compiler/resolver/dispatch.go`, the `protocol.go` flag table) and from the TS mirror, keeping `addedRunTypes` / `addedPureFns`.
- If yes, fix the two names and make the plugin act on them.

Either way, add a test that fails when a TS protocol field names no Go JSON tag (or the reverse), so the two sides cannot drift silently again.

## Docs

None, because the protocol is internal between the resolver and the devtools.

## Done when

- The TS and Go response shapes agree, and a test pins it.
- `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm test` pass; `@mionjs/devtools` dist rebuilt.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan (approved 2026-09-24)

Per-family invalidation is not wanted: the plugin regenerates every cache module off `addedRunTypes` / `addedPureFns`, so the per-family flags were dead weight (plus one `Supports` pass per family on every scan).

- Go: drop the per-family `Added*` fields from `protocol.Response` and `responseAddedFlags`, the `familyAddedFlags` wiring in `dispatch.go`, and the helpers only it used (`FamilySpec.AnySupported`, `AnyFormatTransformSupported` and its test).
- TS: drop the same flags from `protocol.ts` `Response` and the `resolver-client.ts` result types and mapping; `hmr-signals.test.ts` stops asserting `addedValidate`.
- New `packages/devtools/test/protocol-response-keys.test.ts`: reads the Go `MarshalJSON` keys plus `responseAddedFlags` and requires the TS `Response` to name exactly those keys, and every `added*` key on the client result types to be one of them. It fails on the old tree (`addedPrepareForJsonSafe`).
