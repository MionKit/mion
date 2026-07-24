---
type: fix
spec: guidelines
status: ready
created: 2026-07-24
---

# typeid walker: add a depth backstop against fresh-instantiation graphs

## Evidence

Found while shipping [tsconfig-alignment](../done/tsconfig-alignment.md). The
structural-id walker ([typeid.go](../../ts-go-runtypes/internal/cachegen/runtype/typeid/typeid.go))
guards cycles by POINTER identity (`Computer.stack` + `Computer.cache`). That
guard is defeated by type graphs whose descent instantiates a FRESH
`*checker.Type` on every member query — lib.esnext's `IteratorObject` family is
the concrete case: each level's instantiation is a new pointer, `stackIndex`
never matches, and `Compute` recursed until the 1 GB goroutine stack limit
(`runtime: stack overflow`, reproduced via `ts-runtypes gen` on ANY type under
`target: ESNext` / target unset before the enrich-lane fix).

The reachable path was fixed at the CALLER: `walkDeclFiles`
([bridge.go](../../ts-go-runtypes/internal/enrichment/bridge.go)) now stops at
lib-declared types (`bundledLibPrefix` guard), honoring the architecture rule
that lib members are never walked or interned. But the walker itself still has
NO depth bound — any future caller (or a degenerate user-authored type that
instantiates fresh types per level, e.g. deep conditional/mapped recursion)
crashes the process instead of failing cleanly.

Two distinct graph shapes trip this, and separating them bounds the fix.
`IteratorObject` is a MASKED STRUCTURAL CYCLE: free type parameters project to
`unknown` (`KindOf` → `KindUnknown`), so its self-returning methods
(`map<U>(): IteratorObject<U, …>`) make `IteratorObject<U, …>` and
`IteratorObject<U2, …>` the SAME id — a real cycle the pointer guard cannot see,
because each spine level is a fresh `*checker.Type` and `stackIndex` never
matches. The other shape instantiates a GROWING argument per level
(`type Nest<T> = { value: T; next: Nest<[T]> }`): genuinely unbounded DISTINCT
ids, no repeated structure to detect at all. (Verified directly against
`Compute`: a free param → `"2"` (unknown); `Box<U>` and `Box<V>` both give
`30{32:value:2}` while `Box<string>` gives `30{32:value:5}`; and along
`Iter<string>`'s `map` spine each level is a distinct pointer yet the per-level
structure is byte-identical from level 1 — `17{18:0:x:2,->2}` — i.e. eventually
periodic.)

## Fix direction

- Add a depth counter to `Computer.Compute` with a generous cap (hundreds —
  far above any legitimate structural nesting; the current crash depth is
  unbounded). At the cap, fail DETERMINISTICALLY rather than crash: return a
  sentinel that surfaces as a diagnostic (a new catalog code, or fold into an
  existing marker-family error), never a silent truncated id.
- Why a depth cap and NOT structural cycle detection: a structural detector
  would resolve the masked-cycle shape (`IteratorObject`) but does nothing for
  the unbounded-distinct shape (`Nest` above) — there is no repeated structure
  there. A cap covers BOTH, and sidesteps the chicken-and-egg a structural
  detector hits (deciding "seen this shape" needs the id you are mid-computing —
  the knot `structuralSignature`'s bare sub-walk already exists to cut, and it
  inherits the same pointer blind spot).
- Id-stability note: a cap only changes behavior for graphs that today STACK
  OVERFLOW — both shapes above produce NO id at all today (they overflow before
  returning), so no computable id can change — assert that reasoning in the test.
- Consider the same backstop for `structuralSignature`'s bare sub-walk (same
  recursion shape, `bareCycles` mode).
- Test: a fixture that previously overflowed (an esnext-lib type fed directly
  to `Compute`, bypassing the bridge guard) must produce the deterministic
  error, not a crash. Marker rule does not apply (no marker API surface).
