# Step 4: Pick the input maker

The most important decision of the method. Ask: **how is a _valid_ input described?** The answer picks the maker.
Propose one, confirm with the user.

## Look first

This repo already has three makers. Report them before building anything:

- `createMockDataFn<T>()`: a **valid** value of `T`. `packages/run-types/src/mocking/createMockData.ts`.
- `mutateToInvalid(schema, valid)`: a value corrupted at ONE provably-invalid spot.
  `packages/run-types/test/fuzz/value/invalidValue.ts`.
- `randomJunk(depth)`: type-blind random junk (bounded, acyclic). `packages/run-types/test/fuzz/value/fuzzRunner.ts`.

## Choose by how valid input is described

- A. Runtime schema / reflected type (Zod, a RunType, JSON Schema) → DERIVE inputs from it (reflection).
  `createMockDataFn<T>()`, zod-fast-check. The program reads the schema at runtime → make inputs straight from it.
- B. Only a written-down static TS type → reflect it, or hand-write a small maker.
  typia `random<T>()`, or `fc.Arbitrary<T>`.
- C. Raw text / bytes → MUTATE a seed corpus of real samples, splice junk into known-good inputs.
  `fc.string()`, byte-flip a seed. Random bytes alone rarely get past a parser.
- D. A SEQUENCE of operations (code with memory) → make a random LIST of actions + a small model of the state.
  `fc.commands([...])` + a model. The bug only shows after a sequence.
  Template: [model-based.ts](../templates/model-based.ts).
- E. Two coupled things that EVOLVE via edits → a random list of EDIT events + a small state model. Build it.
  Worked case: [enrich-pipeline.md](enrich-pipeline.md).

## Code per kind

A: the schema IS the generator. One reflected type → infinite valid values, near-free:

```ts
import {createMockDataFn} from '@mionjs/run-types/mocking';
const mockUser = createMockDataFn<User>(); // () => User, valid by construction
const u = mockUser(); // a fresh random User every call
```

B: hand-written maker when there is no reflection:

```ts
import fc from 'fast-check';
const userArb: fc.Arbitrary<User> = fc.record({
  id: fc.uuid(),
  name: fc.string(), // empty strings, emoji, RTL marks: the cases you forget
  age: fc.nat({max: 120}),
  tags: fc.array(fc.string()),
});
```

C: start from real seeds, perturb:

```ts
const seedArb = fc.constantFrom(...realSamplePayloads);
const fuzzed = seedArb.chain((s) => fc.string().map((junk) => spliceInto(s, junk)));
```

D: sequences, not single inputs:

```ts
const commands = fc.commands([fc.integer().map((v) => new PushCmd(v)), fc.constant(new PopCmd())]);
fc.assert(
  fc.property(commands, (cmds) => fc.modelRun(() => ({model: {len: 0}, real: new Stack()}), cmds))
);
```

- fast-check is NOT a dependency of this repo: the snippets show the shape. Repo harnesses are dependency-free.
