# Worked case: the enrichment sync pipeline

The method's first user. Goal: event-driven fuzzing proving the enrichment pipeline stays consistent under
_any_ sequence of edits to the source type or the generated file.
Fuzzer + first run: [enrich-fuzzer.md](enrich-fuzzer.md).

## Grounding

- CLI: `ts-go-runtypes/cmd/mion/` [enrich_cli.go](../../../../ts-go-runtypes/cmd/mion/enrich_cli.go)
  (+ `enrich_reconcile.go`, `enrich_check.go`).
- Value-preserving merge: `ts-go-runtypes/internal/enrichment/mirror/`
  [reconcile.go](../../../../ts-go-runtypes/internal/enrichment/mirror/reconcile.go).
- Node shapes: `packages/run-types/src/enrich/`
  [friendlyText.ts](../../../../packages/run-types/src/enrich/friendlyText.ts) + `mockData.ts`.
- Comptime-args validation: `ts-go-runtypes/internal/compiler/comptimeargs/`
  [comptimeargs.go](../../../../ts-go-runtypes/internal/compiler/comptimeargs/comptimeargs.go).
- Example tests already pin single cases: `packages/run-types/test/suites/enrich/`
  [enrichReconcile.test.ts](../../../../packages/run-types/test/suites/enrich/enrichReconcile.test.ts),
  `enrichGen.test.ts`, `enrichCheck.test.ts`. The fuzzer generalises them to "holds for every edit sequence".

## The problem, as a fuzzing problem

- Two **coupled artifacts** evolve:
  - **T**: the source TypeScript type.
  - **E**: its committed enrichment sibling (`*.rt.ts`): the `FriendlyText<T>` map (labels + error templates) and
    the `MockData<T>` map (sample pools / ranges). Scaffolded by the compiler, filled by users / LLMs.
- **Pipeline P** (the `mion` CLI: `enrich` / `enrich --update` / `enrich --prune` / `enrich --no-emit`)
  keeps E consistent with T. **Events** mutate T or E. Code under test = **P**.
- Question: for any event sequence, does P keep T and E consistent? Preserve human work, sync real changes,
  reject nonsense with a clear diagnostic, never silent corruption or a crash.
- Code-with-memory + predicted-change problem: "random bytes" fuzzing cannot express it.
  Exactly what shapes ⑥ predicted change, ⑦ preservation, ⑧ bad input must complain are for.

## The event surface (the input maker's alphabet)

- Events on T: add / remove / rename a field; change a field's type; make a field optional / required;
  widen / narrow a union; add a format brand (e.g. email); reorder fields.
- Events on E: fill a `@todo` blank; edit a label / error template; change a MockData pool / range value;
  add a node (related → ok; UNRELATED → ?); remove / rename a node; edit a comptime-args literal;
  mark `@rtOrphan` / `@rtOrphanChild`; reorder nodes.
- Interleaved with **commands**: `enrich`, `enrich --update`, `enrich --prune`, `enrich --no-emit`.

## Building the pieces

- Generator: EVENT-STREAM generator over the alphabet (no → build) + MODEL of (T, E) tracking expected structure
  (no → build).
- Determinism: seeded event stream (yes → reuse `seededRng.ts`).
- Observation: regenerated E (text / AST) + diagnostics list (yes → CLI already emits both).
- Shrink: drop / simplify events (yes → `fc.commands` shrinks for free).
- Runner: apply event → run command → check oracle, repeat (part → wire to a model harness).
- **The gap = event input maker + the (T, E) model.** Model tracks only _enough_ to state the rules:
  field paths in T, which E nodes are authored vs scaffolded (`@todo`), which edits were "unrelated".

## The rules (R1 to R10)

- **R1** ③ idempotence: `enrich --update` twice ⇒ **byte-identical** file. No drift, no re-stamped `@todo`.
- **R2** ⑥ metamorphic: **one edit to T ⇒ a bounded, predictable change to E.** Local edit → local effect.
  - _add_ field → one new `@todo` scaffold node in both `friendly*` and `mock*`.
  - _remove_ field → node becomes an `@rtOrphanChild` carcass (authored value kept, **not** deleted).
  - _rename_ → value carried under the new key via `@rtIds`. _retype_ → property-merged + MockData re-checked.
- **R3** ⑦ preservation: `enrich --update` **never modifies an authored leaf value**.
  An _unrelated_ change to T leaves every other authored label / pool byte-identical.
- **R4** ⑤ differential: `enrich --no-emit` and `enrich --update` agree on structure.
  `--no-emit` clean (no `enrich-text-*` / `enrich-mock-*` / `enrich-mirror-*` error) ⇒ `--update` makes **no
  structural change**. A missing / extra field is seen by both.
- **R5** ⑧ negative space: every malformed edit yields a **specific code**, never a crash, never silent accept:
  - unrelated field → `enrich-text-unknown-field` / `enrich-mock-unknown-field`.
  - bad `$errors` constraint key → `enrich-text-unknown-error-key`.
  - bad `$[placeholder]` → `enrich-text-unknown-placeholder`. Bad mock pool value → `enrich-mock-invalid-pool`.
  - forbidden construct in a comptime-args `$errors` function (call / ternary / spread / computed key /
    template `${}`) → `marker-comptime-arg-forbidden-construct`.
    Non-literal → `marker-comptime-arg-not-literal`. Too deep → `marker-comptime-arg-too-deep`.
  - deleted source type → `enrich-mirror-source-missing`. Renamed type → `enrich-mirror-type-missing`.
  - "Unrelated node in comptime args → then what?" Answer: `marker-comptime-arg-forbidden-construct`.
- **R6** ③ convergence: after `enrich --update` (then `--prune`) the file is a **fixed point**:
  `enrich --no-emit` passes and a second `--update` is a no-op.
- **R7** ②⑦ orphan round-trip: _remove_ X → `--update` keeps an `@rtOrphanChild` carcass;
  _re-add_ X → `--update` **restores the authored value**. But _remove → prune → re-add_ yields a fresh
  empty `@todo` (`--prune` deleted the carcass, value gone). Both directions must hold exactly.
- **R8** invariant, `@todo` lifecycle: emitted once on a new const. User deletes it → `--update` never re-adds it
  to an existing const; `--prune` never removes it.
- **R9** boundary, markers are compiler-owned: `@rtType` / `@rtIds` are _outputs_, not authored content.
  `--update` refreshes them on structural drift → generator must **not** treat hand-edits to them as R3 targets.
- **R10** ① totality: walkers are depth-bounded (`maxWalkDepth`). Deep or **circular** type → a diagnostic or a
  bounded file, **never** a crash, stack overflow or hang.
- R2, R3, R5, R7 = the valuable, non-obvious ones. Expressible _only_ because the system was modelled as
  events over coupled artifacts.
