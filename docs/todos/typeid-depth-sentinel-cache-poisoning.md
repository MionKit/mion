---
type: fix
spec: guidelines
status: ready
created: 2026-07-30
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

## Done when

- A sentinel-containing subtree is never served from the pointer cache into a
  non-latching walk.
- The depth-backstop tests (`depth_backstop_test.go`) keep passing.
