# Worked case: the enrichment fuzzer and its first run

Rules R1 to R10 and the event alphabet: [enrich-pipeline.md](enrich-pipeline.md).

## Model-based sketch (fast-check shape)

Each command = an event or a CLI run. The model tracks expected `(T, E)` facts; after each command, assert the
relevant R-rule. fast-check generates and **shrinks** the event sequence for free. Illustrative only:

```ts
interface Model {
  fields: Map<string, FieldSpec>; // T's fields
  authored: Map<string, string>; // E nodes the "user/LLM" filled (path → content)
  inSync: boolean; // does check expect to pass?
}
interface Real { workspace: Workspace } // temp workspace: T's source + E + the CLI (in-memory FS, seeded)

class AddFieldToType implements fc.Command<Model, Real> {
  constructor(readonly name: string, readonly type: string) {}
  check = (m: Model) => !m.fields.has(this.name);
  run(m: Model, r: Real) {
    r.workspace.editType(add(this.name, this.type));
    m.fields.set(this.name, {type: this.type});
    m.inSync = false; // T moved, E stale
  }
}
class RunUpdate implements fc.Command<Model, Real> {
  check = () => true;
  run(m: Model, r: Real) {
    const before = r.workspace.authoredContent();
    const diff = r.workspace.run('enrich', '--update'); // the SUT
    r.workspace.run('enrich', '--prune');
    expectDiffLocalTo(diff, changedFieldsSince(m)); // R2: diff touches ONLY nodes for changed fields
    expect(r.workspace.authoredContentFor(unrelated(m))).toEqual(before.forUnrelated); // R3
    expect(r.workspace.run('enrich', '--no-emit').ok).toBe(true); // R6 convergence
    m.inSync = true;
  }
}
// InjectForbiddenComptimeArg: put a non-literal (fn call, ternary, spread, computed key, `${}`) into an inline
//   `$errors` function, the comptime-args literal slot → R5: marker-comptime-arg-forbidden-construct or -not-literal.
// InjectUnrelatedField: editEnrichment(addKey('totallyUnrelated', {pool: []})) → R5: enrich-text-unknown-field
//   or enrich-mock-unknown-field.
// RunCheckVsUpdate: R4: `--no-emit` ok === a following `--update` changed nothing.
// Still to add: RemoveField, RenameField, RetypeField, FillTodo, RunPrune, OrphanRoundTrip (R7), …

test('enrichment sync stays consistent under any edit sequence', () => {
  const cmds = fc.commands(
    [
      fc.tuple(fc.string(), fc.constantFrom('string', 'number', 'User')).map(([n, t]) => new AddFieldToType(n, t)),
      fc.constant(new RunUpdate()),
      /* InjectForbiddenComptimeArg, InjectUnrelatedField, RunCheckVsUpdate, … */
    ],
    {maxCommands: 40}
  );
  fc.assert(fc.property(cmds, (run) => fc.modelRun(() => ({model: freshModel(), real: freshWorkspace()}), run)),
    {numRuns: 300});
  // every failure prints the seed + the shrunk minimal event sequence that broke a rule.
});
```

- Payoff: a failure never says "something's off". It says e.g. _"seed 0xC0FFEE: after `addField('x') →
  enrich --update → renameField('y','z') → enrich --update`, node `z`'s authored label was lost (R3)"_.
  Already shrunk to the minimal sequence.

## The real implementation

- [`packages/run-types/test/fuzz/enrich/`](../../../../packages/run-types/test/fuzz/enrich/):
  `enrichCli.ts` (non-throwing CLI wrappers), `enrichModel.ts` (model + event / oracle command set),
  `enrichFuzzRunner.ts` (seeded driver + prefix shrinker), `enrichFuzz.integration.test.ts` (the spec).
- Repo's own **dependency-free** seeded-harness style (reuses `test/fuzz/core/seededRng.ts`), not fast-check.
- Run: `pnpm miondevx core fuzz enrich`. Soak: `pnpm miondevx core fuzz enrich --soak`.

## First run: what we learned

- **Green** across thousands of CLI runs (30 sequences × 14 events, and 40 × 16): R1 to R10 held, zero false alarms.
- Negative control (assert bogus code) proved the negative-space probes run and the harness reports + shrinks:
  ```
  [R5] unknownMockField (step 0): expected enrich-mock-bogus; check returned [enrich-mock-unknown-field]
  Minimal reproducer — seed 0xe6650f23, 1 event(s):
  ```
- Two lessons, both about step 1 (what you can see): the channel you observe through bounds your rule set.
  1. `enrich --no-emit` is the wrong instrument for comptime args. A non-literal in a comptime-args `$errors`
     function is policed at **build / transform time** (`marker-comptime-arg-not-literal` / `-too-deep` /
     `-forbidden-construct`), NOT by `enrich --no-emit`.
     - `--no-emit` treats a function-form `$errors` as opaque and walks past it: `ts-go-runtypes/internal/enrichment/`
       [validate.go](../../../../ts-go-runtypes/internal/enrichment/validate.go).
     - `enrich-mock-invalid-pool` (pool value vs field type) is build-time too.
     - So a check-driven fuzzer covers R5 for `enrich-text-unknown-field` / `enrich-text-unknown-placeholder` /
       `enrich-mock-unknown-field` only. `marker-comptime-arg-*` / `enrich-mock-invalid-pool` need a second,
       build-driven harness.
  2. `enrich --no-emit` silently returns zero findings when the type cannot resolve. Mirror whose `mion` import
     does not resolve (e.g. fixture _outside_ the workspace) → validator walks nothing, reports clean.
     - A mislocated harness makes every negative-space rule **pass for the wrong reason**: the "inputs must reach
       the case" trap one level up. The negative control caught it.
