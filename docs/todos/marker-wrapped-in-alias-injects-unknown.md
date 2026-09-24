---
type: fix
spec: guidelines
status: ready
created: 2026-09-24
---

# A marker wrapped in a user alias injects the id of `unknown`

## Intent

A parameter typed through an alias over a marker is matched only by its brand property, so the build injects the id of `unknown` and says nothing:

```ts
type Slot<P, R> = InjectRunTypeId<[P, R]>;
function fn(x?: Slot<A, B>) {}
```

In `ts-go-runtypes/internal/compiler/marker/marker.go`, `DetectAny` tries `matchAliasSpec`, which sees the outer alias name (`Slot`) and fails, then `matchedByBrand` matches with a nil type argument. The scanner still emits a site, for `unknown`.

Found while adding the route `syncId` slot to the router helpers (`packages/router/src/types/mionRouter.ts`): every handler silently got the same id until the alias was inlined. The bundled-vs-server parity test in `packages/client/test/lib/parity.ts` caught it. Predates that change.

## Direction

Either resolve the type argument through a wrapping alias when the marker comes from the trusted package (read the brand property's type, or walk the alias chain), or raise a clear diagnostic when a trusted-package marker matches by brand only. Keep the untrusted-package gate (MKR012 near miss) inert for a project's own look-alike brand. Follow the Marker test coverage rule in `ts-go-runtypes/CLAUDE.md`. The implementer plans the details.

## Docs

None, because this is build internals with no consumer-facing knob.

## Done when

- A marker wrapped in an alias either injects its real type argument or the build reports it.
- Go and JS tests cover it, with both `getRunTypeId` call shapes as paired tests.
- The simplify-comments pass ran on every touched source file, committed on its own.
