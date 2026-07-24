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

## Plan — depth cap + MKR008 diagnostic (approved 2026-07-24)

Flag + stable-sentinel design (no panic). `Compute` is the sole recursive core and
every walk shares `computer.stack`, so ONE guard keyed on `len(computer.stack)`
covers the main walk, the `structuralSignature` sub-walk, and
`collapsedIntersectionID`.

- **`typeid.go`** — `const maxWalkDepth = 512`; `Computer.depthExceeded bool` +
  `DepthExceeded()` / `ResetDepthExceeded()`. In `Compute`, after the cache-hit and
  cycle-ref returns and before the push: `if len(computer.stack) >= maxWalkDepth`,
  set the flag and return a stable `depthSentinel` (deterministic; the flag, not the
  string, is authoritative; not cached). In `structuralSignature`, propagate
  `sub.depthExceeded` to the outer computer.
- **`serialize.go`** — `Cache.depthExceeded bool` + accessors. In `assignID`, bracket
  the `idComputer.Compute` call (serialize.go:508): reset the computer flag before,
  and after, if exceeded, set `cache.depthExceeded` and return
  `internEmpty(KindUnknown, "depthExceeded")` WITHOUT projecting — no truncated node.
- **`scan.go` / `scan_parallel.go`** — add `site diagnostics.Site` to `pendingCall`
  (built in `analyzeCall` via `textpos.NodeSite`, like MKR003); widen `commitPending`
  to also return diagnostics, resetting the cache flag before `AssignIDUnder` and
  emitting `diagnostics.New(CodeStructuralIdDepthExceeded, pending.site)` when set;
  both commit loops append into the scan diagnostics (→ `combinedDiagnostics`).
- **`internal/diagnostics/`** — `CodeStructuralIdDepthExceeded = "MKR008"`,
  `FamilyMarker` / `SeverityError` (reuses the MKR eslint routing, precedent CTA002);
  required `Headline` in `messages.go`; optional `prose.go` (empty `Example`).
  Regenerate the FE `diagnosticCatalog.generated.ts` + rebuild `ts-runtypes-devtools`.
- **Test** — `internal/compiler/resolver/depth_backstop_test.go`, driven through
  the resolver scan (a hermetic self-instantiating interface, no lib-config
  dependency, instead of the fix-direction's "esnext-lib type fed directly to
  Compute"): `getRunTypeId<Iter<string>>()` over
  `interface Iter<T> { map<U>(fn: (x: T) => U): Iter<U> }` emits exactly one MKR008
  (Error) and does NOT crash; a PAIRED value-first case
  (`declare const it: Iter<string>; getRunTypeId(it)`) trips the same cap
  identically (Marker test-coverage rule); plus an id-stability case (legit
  deep + genuinely-cyclic types emit ZERO MKR008 and keep normal ids).

Cap value 512 = "hundreds" per the fix direction: far above legitimate nesting,
~100× below the frame count that overflows.

**Shipped as described** — MKR008 (FamilyMarker / SeverityError), cap 512, flag +
sentinel (no panic), emitted at `commitPending`. Go suite + full JS suite +
lint/typecheck/format all green; FE diagnostic catalog regenerated.
