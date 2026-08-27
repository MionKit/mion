---
type: feature
spec: guidelines
status: done
created: 2026-08-20
---

# Convert circular types to builders instead of refusing

## Intent

The builders conversion (`convert --to builders`) refuses several classes of
recursive (circular) types today. The newest class made the limitation
visible: a recursive named type whose cycle needs a getRunType escape (e.g. a
method member) now refuses loudly — before that fix it silently collapsed the
whole knot to `any` (elision fuzz seed 886383364,
`TestChain_EscapeOnCycleRefuses`). A loud refusal beats silent type erasure,
but the limitation itself should not exist: recursive types are ordinary
TypeScript, and the conversion should carry them. The fix should also grow the
fuzz generator's circular coverage so the lanes hold the new ground.

## Direction

The implementer investigates and plans the details. The refusal surface to
retire (or knowingly keep, case by case) — all in
`ts-go-runtypes/internal/convert/`:

- **Escape-on-cycle** (the new one): embedded type text cannot close a cycle,
  because converted names resolve through EAGER `InferType<typeof constRT>`
  chains — `print.go` `declRef` ("self-referential type inside an embedded
  type expression…"), pinned by `TestChain_EscapeOnCycleRefuses` in
  `circular_test.go`. One direction worth weighing: keep or emit a REAL type
  declaration for such cycles (real type names resolve lazily, which is why
  the pure type target already handles recursion fine) and let the escape
  reference it.
- **Lossy circular payloads**: container-level sentinel intersections
  (structural format brands, contains / pattern / propertyNames, tuple label
  carriers) refuse inside recursive types because `Recursive<Body>`'s
  homomorphic `Self` substitution merges them, moving the id
  (`print.go` / `callsites.go`: "RT.circular cannot carry it through the
  self-substitution"). The mechanism lives in the marker package:
  `RT.circular` / `Recursive<Body>` / `Self` in
  `packages/ts-runtypes/src/builders/compose.ts` + `static.ts` — extending it
  type-level, or closing the knot differently, is the heart of this todo.
- **Tuple-slot cycles**: TypeScript instantiates mapped tuple slots eagerly,
  so `Recursive` unrolls (`print.go`: "a cycle that closes on a tuple slot…",
  `TestCircular_TupleSlotCycleRefusedOnValueForms`). May prove genuinely
  impossible at the type level — if so, keep the refusal and say why in the
  moved spec.
- **Anonymous / call-site cycles**: `self()` / `$ref` bind the root only
  (`print.go` "cycle through an unnamed type…", `callsites.go` "no name to
  close a cycle on"). Same lazy-name direction may apply.

Hard constraint carried by every direction: the converted spelling must
resolve the SAME structural ids as the type form (the convert lane's C2
oracle) — id drift is the reason the current refusals exist.

Fuzzer side: `test/fuzz/core/typeGen.ts` already generates self-recursive
interfaces (optional self props, `kidsN` arrays; `isRecursive` gates oracle
tiers). Grow the circular space as support lands — e.g. mutual decl cycles
and knots through the root alias — and shrink the designed-refusal surface
the lanes skip: `EXPECTED_REFUSALS` in
`test/fuzz/convert/convertRoundtrip.ts` (its own comment says shrinking it is
how coverage grows), plus the re-roll paths in the elision lane.

Housekeeping: `print.go`'s comment near `printDecl` says the Recursive
limitation "is filed in docs/todos/" — this doc is that filing; keep the
pointer true as specs move.

## Done when

- Recursive shapes that today refuse (at minimum the escape-on-cycle class)
  convert to builders with ids equal to the type form; genuinely impossible
  classes (likely tuple slots) stay loudly refused with the reasoning
  recorded when this spec moves to docs/done/.
- `TestChain_EscapeOnCycleRefuses` (and friends) updated to pin the new
  supported behavior; the fuzz lanes generate the newly-supported circular
  shapes and hold C2 / roundtrip green over them, with `EXPECTED_REFUSALS`
  shrunk to match.
- Website conversion docs reflect what converts.

## Plan — lazy pair form (approved 2026-08-27)

Approach picked by the user (option A of two investigated):

- **Escape-on-cycle recursive types convert to the "lazy pair"**: keep the
  declaration a REAL type (real type names resolve lazily, so the cycle stays
  legal TypeScript) and emit a value handle const beside it:
  `type TreeNode = {label(): string; kids: Forest};` +
  `const treeNodeRT = getRunType<TreeNode>();`. Type text cannot hold
  `RT.self()`, and a converted name resolves through the eager
  `InferType<typeof constRT>` chain (circular const inference → `any`), so the
  name has to stay real. Ids cannot move because the type is unchanged (C2 safe
  by construction).
- **`recognize.go` learns the pair**: `const xRT = getRunType<Name>()` over a
  same-file type declaration is recognized as ONE builders-form declaration
  (type stmt + const stmt), so a second `--to builders` run is a byte no-op
  (C5) and `--to type` collapses the pair back to the type declaration through
  the existing alias-drop + CNV003 (const still used) machinery.
- **`print.go` falls back** to the pair when the builders print of a type-form
  declaration hits either escape-on-cycle refusal; call sites and the type
  target keep refusing as before. In a mutual cycle both sides fall back.
- **Kept refused, by decision**: tuple-slot cycles (TypeScript instantiates
  mapped tuple slots eagerly, `Recursive<Body>` unrolls — no type-level fix
  found) and anonymous / call-site cycles (no declaration to keep real).
- Fuzz: drop the embedded-self-reference entry from `EXPECTED_REFUSALS`, grow
  `typeGen.ts` with mutual declaration cycles, hold convert / convertcli /
  elision lanes green. Docs: update the conversion guide's recursion prose and
  refusal table.

## Shipped (2026-08-27)

What actually landed, including a mid-implementation extension the user
approved:

- **Escape-on-cycle AND tuple-slot recursive declarations both convert now**,
  through the lazy pair (`printLazyPair` in
  `ts-go-runtypes/internal/convert/print.go`, pairing in `recognize.go`).
  The original decision to keep tuple cycles refused was reversed once it was
  clear the pair sidesteps `Recursive<Body>` entirely: the declaration stays a
  real deferred alias, so TypeScript never instantiates the tuple eagerly.
  `type Pair = [number, Pair]` now converts to itself plus
  `const pairRT = getRunType<Pair>();`.
- **The "lossy circular payloads" class turned out to be dead code**:
  `circularLossyPayload`'s walk always returned empty (the `oneOf` payload it
  described no longer exists in the codebase, and the optional-slot labeled
  tuple case already converts). The function, its callers and the equally
  unreachable `reachesCycle` helper were deleted rather than extended.
- **Still refused, on purpose**: anonymous cycles and recursive types written
  inline at call sites. A call site has no declaration to keep real, so there
  is no name for the loop to close on. `RT.circular` + `RT.self()` keeps
  covering plain-data recursion unchanged.
- Fuzz: `EXPECTED_REFUSALS` is now empty (both entries retired);
  `typeGen.ts` grows mutual interface cycles (knot props through optional /
  array positions); convert, convertcli and elision lanes green at quick tier.
- Tests: `TestChain_EscapeOnCycleConvertsLazyPair`,
  `TestCircular_TupleSlotCycleConvertsLazyPair`, `TestPair_*` (hand-written
  pair fixpoint + const-still-used guard), a CLI e2e pair round-trip, and the
  refusal rows removed from `unsupported-conversion.test.ts`.
- Docs: the source-conversion guide's What-converts section documents the
  pair; the tuple and embedded-recursion rows left the refusal table.
