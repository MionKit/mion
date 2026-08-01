---
type: fix
spec: guidelines
status: done
created: 2026-07-30
completed: 2026-08-01
---

# typeid: a cached parent of a depth-sentinel walk can ship the sentinel silently

Pre-existing issue surfaced by the lowlink-gate design review (not introduced
or fixed by it — the sentinel is not a cycle token, so the gate does not
govern it).

## The hazard

`Compute` returns the deterministic sentinel `$depth` when a walk exceeds
`maxWalkDepth`
([typeid.go](../../ts-go-runtypes/internal/cachegen/runtype/typeid/typeid.go),
the `depthSentinel` path). The sentinel itself is deliberately never cached,
and the latched `depthExceeded` flag makes the CURRENT walk's id discarded and
diagnosed (MKR008/MKR009 via `assignID` / `commitPending`). But a PARENT
subtree containing the sentinel IS cached (the ordinary pop-time cache write),
and the latch is reset per top-level walk (`ResetDepthExceeded`,
`assignID`) — so a LATER, non-latching walk can cache-hit that parent and
compose a `$depth`-poisoned structural string into a real id with no
diagnostic.

## Fix direction

Also require `!computer.depthExceeded` at the cache-write gate in `Compute` —
a safe overapproximation: frames popped before the latch cannot contain the
sentinel, and latched walks are diagnosed anyway. One line plus a test that
(1) triggers a depth-capped walk, (2) re-walks a type sharing the poisoned
parent pointer in a fresh top-level walk, and (3) asserts the recomputed id
carries no `$depth` and no silent commit happens.

## What shipped

Both pop-time cache writes in `Compute` now route through a `commitCache`
helper that skips the write while `depthExceeded` is latched:

```go
func (computer *Computer) commitCache(tsType *checker.Type, id string) string {
	if !computer.depthExceeded {
		computer.cache[tsType] = id
	}
	return id
}
```

The alias-probe write needed the same gate as the ordinary one — both compose
from `base`, which is what carries the sentinel. `canonicalizeCluster`'s own
member writes were already unreachable while latched (the `wasTarget &&
!computer.depthExceeded` guard above them), which is the existing precedent
this follows.

## The regression test

`TestScan_DepthSentinelDoesNotPoisonALaterWalk` in
[depth_backstop_test.go](../../ts-go-runtypes/internal/compiler/resolver/depth_backstop_test.go).

Reproducing the hazard needs a *shared* node, not just a deep one. On a uniform
linear spine the bug is self-cancelling: a node is poisoned only if it sits
above the trip point, and any such node also trips the cap when walked on its
own, so it is never the "later, non-latching walk". The fixture therefore uses
two chains — a shared `S0…S300` plus a spine `D0…D400` whose bottom reaches
into `S300`:

- Walking `D400` descends 401 frames to `S300`, then 112 more before hitting
  the cap INSIDE the shared chain, so `S300` is on the stack when the walk
  latches and composes the sentinel into its own text.
- Walking `S300` alone is 301 frames, comfortably under the cap, so it must
  resolve to a real sentinel-free id.

Walk frames are 1 per nesting level (measured: a linear spine trips between
depth 510 and 520, matching `maxWalkDepth = 512`), which is what makes the
401/112 arithmetic land.

The assertion is differential: `S300`'s id in a program that also walks `D400`
must be byte-identical to `S300`'s id in a program that does not. Three
preconditions guard it — `D400` trips exactly once, the diagnosed site drops
out leaving only the `S300` site (asserted by source position, so a future emit
change cannot silently swap which site is compared), and the control program
trips zero times.

**Verified to fail without the fix:** with the gate disabled, `S300` resolves
to `kaGkOk0` alongside the deep walk but `QuquIgm` on its own — a silently
wrong id, committed with no diagnostic. With the gate, both are `QuquIgm`.

## Verified

- `go -C ts-go-runtypes test ./internal/...` fully green, including all seven
  depth-backstop tests.
- `pnpm test` green (241 files / 8294 tests) — no legitimate id changed, as
  expected: the gate only suppresses writes during a walk whose result is
  discarded anyway.
- `pnpm run lint` / `pnpm run format` green.

## Done when

- [x] A sentinel-containing subtree is never served from the pointer cache into a
      non-latching walk.
- [x] The depth-backstop tests (`depth_backstop_test.go`) keep passing.
