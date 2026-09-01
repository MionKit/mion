---
name: runtypes-mock-data
description: Author and use a `MockData<T>` for a RunTypes type — the committed, type-keyed map of realistic sample-value POOLS / RANGES per field that feed `createMockDataFn<T>()`. Use when generating mock data, sample values, realistic test fixtures, or seed data for a type; when authoring or editing a `*.rt.ts` enrichment sibling's mock map; or when wiring per-field `{ pool }` / `{ min, max }` / `{ rt$items, rt$length }` / `{ rt$optional }` overrides into `createMockDataFn<T>({ data })`. Covers the per-field node shape, that pool/range values are validated against the field's type + format at build time (the MD003 rule), and where the map lives.
---

# Authoring & using `MockData<T>`

`MockData<T>` is one of two **AI-enrichment artifacts** in RunTypes (the other is
`FriendlyText<T>` — see the `runtypes-friendly-type` skill). Unlike validators / codecs
(pure functions of the type, recomputed every build, never committed), enrichment is
**authored once, committed, and validated against the type forever after**. The full
design is [docs/AI_ENRICHMENT.md](https://github.com/MionKit/mion/blob/main/docs/AI_ENRICHMENT.md).

A `MockData<T>` is a per-field map of **realistic sample values** — pools, ranges,
element + length hints, optional-probability — that feeds the existing
`createMockDataFn<T>()` generator. The mechanical generator stays deterministic; the map
only supplies the realistic _values_ (a believable name, a plausible age, a valid
email). The DSL type is
[`mockData.ts`](https://github.com/mionkit/run-types/blob/main/packages/run-types/src/enrich/mockData.ts), exported from
`mion`.

## When to use it

- You call `createMockDataFn<T>()` and the mechanical random values are unrealistic
  (random strings for names, out-of-domain numbers) and you want believable fixtures.
- You're building test fixtures / seed data and want pools of real-looking values that
  are still **guaranteed valid** for the type.
- You're scaffolding a type's committed mock mirror file.

If random-but-valid values are fine, just call `createMockDataFn<T>()` with no `data` —
the generator already mocks every shape mechanically (including `Date`, `Map`, `Set`).

## What is shipped today vs designed

- **Shipped:** the `MockData<T>` DSL type
  ([`mockData.ts`](https://github.com/mionkit/run-types/blob/main/packages/run-types/src/enrich/mockData.ts)); the
  `{ data }` option on `createMockDataFn<T>()`
  ([`createMockData.ts`](https://github.com/mionkit/run-types/blob/main/packages/run-types/src/mocking/createMockData.ts)) —
  pass `createMockDataFn<T>({ data })` and generated values are drawn from the authored
  pools / ranges (both exported from `mion`); and the `enrich` / `enrich --no-emit` CLI that
  scaffolds the mock mirror file and cross-checks it against the live type (MD001) —
  see the `rt-enrich-types` skill for the CLI loop.
- **Designed (not yet wired):** the MD003 pool-value validation (the build-time check
  that each pool entry satisfies its field's format — it needs the runtime validator)
  plus MD002/MD004/MD005. The map is type-checked against `T` by the `MockData<T>`
  mapped type today regardless.

## The node model — per-field pools / ranges

One recursive node, uniform at every depth, structure checked against `T` by the
`MockData<T>` mapped type. Per-field shape depends on the field's kind:

| Field kind         | Node shape                                                                    |
| ------------------ | ----------------------------------------------------------------------------- |
| string             | `{ pool?: string[] }`                                                         |
| number             | `{ pool?: number[]; min?: number; max?: number }`                             |
| `Date`             | `{ pool?: Date[]; min?: Date; max?: Date }`                                   |
| boolean / bigint   | `{ pool?: boolean[] }` / `{ pool?: bigint[] }`                                |
| array / rest tuple | `{ rt$items?: <element node>; rt$length?: number \| [number, number] }`       |
| fixed tuple        | `{ rt$slots?: [<node per slot>] }` — positional, fixed length, no `rt$length` |
| `Map`              | `{ rt$keys?, rt$values?: <node>; rt$size?: number \| [number, number] }`      |
| `Set`              | `{ rt$values?: <node>; rt$size?: number \| [number, number] }`                |
| object             | `{ [K in keyof T]?: <child node> } & { rt$optional?: number }`                |

- **`pool`** — pick a value at random from this list.
- **`min` / `max`** — inclusive bounds (numbers, `Date`s).
- **`rt$items`** — the element node for array (and rest-tuple) members; **`rt$slots`** — one
  node per fixed-tuple position.
- **`rt$length`** — array length, fixed (`3`) or a `[min, max]` range; **`rt$size`** — the
  Map/Set equivalent.
- **`rt$optional`** — present-probability (0..1) for optional members on an object node.

## The pool-validation superpower (MD003)

Because RunTypes can **validate**, the compiler can check that **every pool / range
value actually satisfies its field's type and format** — at build time, not test
runtime. An
LLM that hallucinates a malformed email into the `email` pool, or a `score` of `150`
into a `FormatNumber<{max: 100}>` field, is caught at parse time (MD003, Error). No
other mock library can do this — it falls straight out of the existing validator.
MD003 is designed but not wired into `enrich --no-emit` yet; shipped today is MD001 (key not a
field of `T`, Error). Also designed: MD002 (structural mismatch — left to the
`MockData<T>` mapped type), MD004 (`min > max` / inverted `rt$length`), MD005 (pool below
a configured floor, off by default).

## Where the map lives — the mock mirror file

Like `FriendlyText<T>`, a `MockData<T>` map is committed in a **mirror directory** whose
tree shadows your source, anchored at the file where the **type is defined**, not where
it's consumed — and each enrichment family gets its own file: `src/models/user.ts` →
`<genDir>/enriched/mock/models/user.ts` (by convention under `genDir`, so
`src/__runtypes/enriched/mock/models/user.ts`), holding `mock<Name>` consts. `FriendlyText<T>`
consts live separately under `<genDir>/enriched/friendly/…` — the two families never share one
file. One mirror file per source file, one `export` per enriched type defined there —
**one enrichment home per type, at its definition**, however many files mock it. It's
the first committed RunTypes artifact (everything else is gitignored cache) and is
hand-editable. `MockData<T>` is generated **demand-driven** — only for types actually
consumed by a `createMockDataFn` call.

```ts
// src/__runtypes/enriched/mock/models/user.ts — committed, hand-editable
import type {MockData} from 'mion';
import type {User} from '../../../../src/models/user';

export const mockUser: MockData<User> = {
  /* … */
};
```

## Feeding it to `createMockDataFn<T>()`

The consumer imports the map from the sibling and passes it via the `data` option
(plain, greppable wiring — no injection magic):

```ts
import {createMockDataFn} from 'mion';
import {mockUser} from 'src/__runtypes/enriched/mock/models/user';
import type {User} from '../models/user';

const makeUser = createMockDataFn<User>({data: mockUser});
const sample = makeUser(); // realistic, type-valid User
```

(`data` rides the same options bag as `{ mock }` — `createMockDataFn<T>({ data, mock })`.
Supplying no `data` mocks mechanically, exactly as before. The map is type-checked
against `T` regardless.)

## End-to-end example

```ts
// src/models/user.ts — the DEFINITION
import type {FormatNumber, FormatEmail} from 'mion';

export interface User {
  name: string;
  age: FormatNumber<{min: 0; max: 120}>;
  tags: string[];
  profile: {
    email: FormatEmail;
    score: FormatNumber<{min: 0; max: 100}>;
  };
}
```

```ts
// src/__runtypes/enriched/mock/models/user.ts — the committed mock mirror
import type {MockData} from 'mion';
import type {User} from '../../../../src/models/user';

export const mockUser: MockData<User> = {
  name: {pool: ['Alice Martin', 'Liang Wei', 'Fatima Noor', 'Diego Ramirez']},
  age: {min: 18, max: 95},
  tags: {
    rt$items: {pool: ['urgent', 'beta', 'vip']}, // element node
    rt$length: [1, 4], // 1–4 tags
  },
  profile: {
    email: {pool: ['alice@example.com', 'liang@corp.io', 'fatima@mail.net']},
    score: {min: 0, max: 100},
  },
};
```

```ts
// src/test/fixtures.ts — the CONSUMER
import {createMockDataFn} from 'mion';
import {mockUser} from 'src/__runtypes/enriched/mock/models/user';
import type {User} from '../models/user';

const makeUser = createMockDataFn<User>({data: mockUser});

const fixture = makeUser();
// e.g. { name: 'Liang Wei', age: 41, tags: ['beta','vip'],
//        profile: { email: 'alice@example.com', score: 72 } }
```

Every value above satisfies `User` — and once MD003 is wired into `enrich --no-emit`, a stray
`age: 200` or `email: 'nope'` in the map fails the build, never the test.

## Authoring checklist

- Put the map in the **definition's mock mirror file** (`<genDir>/enriched/mock/<rel>.ts`,
  default `src/__runtypes/enriched/mock/…`), not the consumer's file.
- Type it `MockData<T>` so structure is checked against `T`.
- Use `pool` for enumerable/realistic values (names, emails, tags); use `min`/`max` for
  numeric and `Date` ranges.
- Keep every pool/range value **valid for the field's type + format** — MD003 will
  reject `score: 150` against `FormatNumber<{max: 100}>`.
- For arrays set `rt$items` (element values) and `rt$length` (count); fixed tuples take
  `rt$slots`, Map/Set take `rt$keys`/`rt$values` + `rt$size`; for objects use `rt$optional` to
  tune optional-member probability.
- Keep mock pools out of production bundles — import them from tests/seeds only
  (normal tree-shaking handles it).
- Aim for a healthy pool size (the design notes a floor around 50 for realistic
  variation; MD005 is an off-by-default nudge).
