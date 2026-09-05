---
type: fix
spec: guidelines
status: done
created: 2026-09-05
---

# A type-id collision fails the build and points at `hashLength`

## Intent

`hashid.Dict` used to answer a type-id collision by re-hashing the second type at a longer length
(7, 9, 11 characters...), giving up only after 22 attempts. Two colliding types silently got ids of
different lengths, nothing told the user, and the id length stopped being the configured number.
A collision at the configured length now stops the build with a diagnostic that names both types and
tells the user to raise `hashLength`. With the two-lane hasher a collision at seven characters is a
rare event, so failing loudly costs nothing in practice and keeps every type id at exactly the
configured length.

## What shipped

### `hashid` no longer grows ids

`ts-go-runtypes/internal/cachegen/hashid/hashid.go`

- The growth loop in `UniqueSalted` is gone. A hash already owned by a different id is a collision,
  reported as a typed `*Collision{Hash, ID, Owner, Length}` so the caller can name both sides.
- `hashIncrement`, `MaxCollisions` and `ErrTooManyCollisions` are deleted; nothing else used them.
- `QuickHash` / `QuickHashSalted` lost their `prev` parameter. Every call site passed `""`; only the
  growth loop ever used it.

### The cache latches, the resolver raises

`ts-go-runtypes/internal/cachegen/runtype/serialize.go`, `internal/compiler/resolver/scan.go`

Mirrors the existing `depthExceeded` latch: the cache records the collision, the resolver (which is
the layer that knows call sites) turns it into a diagnostic.

- New `Cache.hashCollision` latch plus a `HashCollision{Hash, Structural, Owner, Length}` accessor.
  Not cleared per walk, unlike the depth latch: a collision poisons the whole dictionary rather than
  one site. `Clear()` drops it along with the dict.
- `uniqueDict` lost its error return and is now the single place a collision is handled: it latches
  and returns a NUMBERED placeholder (`x_c<n>_<hash>`). That number is load-bearing. The old
  fallback at each call site was `"x_" + QuickHash(structural, …)`, which derives the SAME string
  for both colliders, so the two types would have silently folded into one cache entry. All 13 call
  sites (11 in `serialize.go`, 2 in `intersection_collapse.go`) dropped their fallback block.
- `commitPending` reads the latch right after the depth check, raises `MKR014`, and emits no site,
  exactly as it does for `MKR008`.
- `Session.sampleOrigins` (`map[string]string`) became `idOrigins` (`map[string]diagnostics.Site`),
  so the same first-site record serves both `FMT006` and `MKR014`. `FMT006`'s message now reads
  `file:line:col` instead of a byte offset.

### `MKR014`

`ts-go-runtypes/internal/diagnostics/`

`CodeTypeIdCollision`, `FamilyMarker`, `SeverityError`, `ScopeNotSource`. The `MKR` prefix puts it in
the website's "Markers and call sites" section and routes it to the `invalid-marker` lint rule with
no table edits. No `Example`: no short snippet can arrange two shapes that collide at seven
characters.

Args are the shared id, both structural shapes (clipped to 100 runes so a big nested type cannot
swamp the log), the length to try next, and where the first shape came from. A `Related` pointer is
attached when the type that took the id first was itself a marker call; an inner node (a union
member, a tuple slot) has no site of its own and reads as "another site" instead.

```
entry.ts(3,29): error MKR014: Two different types get the same id `X`: `30{32:p1:5}` from
  f1.ts:3:19, and `30{32:p12:5}` here. Raise the `hashLength` option to 2 so every type keeps
  its own id.
  Related: f1.ts(3,19): first type to take the id `X`
```

### The enrich lane too

`ts-go-runtypes/internal/enrichment/bridge.go`

`ResolveTypeRaw` runs its own cache outside the resolver, so a collision there would have latched
and never been read. It now returns a plain error naming both shapes and `hashLength`, rather than
emitting mirror files keyed by an id two types share.

## Tests

- `hashid_test.go`: the two extension tests are replaced by `TestUnique_CollisionIsAnError` (a
  deterministic sweep at length 1, where only 52 ids exist, asserting the typed error names both
  sides and that the loser is not recorded) and `TestUnique_EveryIdHasTheRequestedLength`. The 10k
  sweep moved from length 6 to the default 7 and now also asserts the length, since at 6 it only
  passed because extension hid any collision.
- New `internal/compiler/resolver/typeid_collision_test.go`, paired per the Marker test coverage
  rule: static and reflect `getRunTypeId` forms both raise `MKR014` at `hashLength: 1` over a
  60-member literal union (60 ids into 52 buckets is a collision by pigeonhole, so the test is
  deterministic); a third test pins the `Related` pointer; a fourth pins that the same union at the
  default length raises nothing and both forms share one entry.
- `packages/devtools/test/fail-on-error.test.ts`: the real rollup plugin over a real binary halts
  the build on `MKR014` and the log names `hashLength` and the length to try, proving the whole
  path end to end.
- `packages/devtools/test/eslint/routing.test.ts`: the Go↔JS drift guard already covered the new
  code; its title carried a stale hardcoded count, now dropped.

## Docs

`pnpm miondevx core codegen diag` regenerated `diagnosticCatalog.generated.ts` and the website's
`diagnostics-catalog.json`, which is what renders the diagnostics page. The `hashLength` row in
`container/website/content/02.runtypes/01.introduction/04.configuration.md` now says the build stops
and names both types, which is what the row already promised.

## Done

- Two distinct types hashing to the same id at the configured length fail the build with a
  diagnostic naming both and the `hashLength` option; no id is ever extended and every type id has
  exactly the configured length.
- `Dict` no longer grows lengths; its tests pin the failure instead of the extension; Go and JS
  suites are green.
