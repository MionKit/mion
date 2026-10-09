---
name: runtypes-mock-data
description: Author MockData<T> pools/ranges for createMockDataFn<T>(). Use for realistic mock data, fixtures, seeds.
---

# Authoring & using `MockData<T>`

- One of two AI-enrichment artifacts in RunTypes. Other: `FriendlyText<T>` (`runtypes-friendly-text` skill).
- Enrichment is authored once, committed, validated against the type. CLI loop: `rt-enrich-types` skill.
- Full design: [docs/AI_ENRICHMENT.md](https://github.com/MionKit/mion/blob/main/docs/AI_ENRICHMENT.md).
- `MockData<T>` = per-field **realistic sample values** (pools, ranges, element + length hints, optional-probability).
- Feeds `createMockDataFn<T>()`. Generator stays deterministic; map only supplies realistic _values_
  (believable name, plausible age, valid email).

## When to use it

- `createMockDataFn<T>()` values unrealistic (random strings for names, out-of-domain numbers).
- Building test fixtures / seed data: pools of real-looking values, still **guaranteed valid** for the type.
- Scaffolding a type's committed mock mirror file.
- Random-but-valid is fine → no `data`: generator already mocks every shape (incl. `Date`, `Map`, `Set`).

## Shipped vs designed

- **Shipped**, both exported from `@mionjs/run-types`:
  - `MockData<T>` DSL type ([`mockData.ts`][md]).
  - `{ data }` option on `createMockDataFn<T>()` ([`createMockData.ts`][cmd]):
    `createMockDataFn<T>(undefined, { data })` draws values from the authored pools / ranges.
  - `enrich` / `enrich --no-emit` CLI: scaffolds the mock mirror file, cross-checks it against the live type
    (enrich-mock-unknown-field: key not a field of `T`, Warning).
- **Designed (not yet wired into `enrich --no-emit`):**
  - enrich-mock-invalid-pool (Error): compiler checks **every pool / range value** against field type + format.
    At build time, not test runtime (malformed email in the `email` pool). Needs the runtime validator.
  - enrich-mock-shape-mismatch: structural mismatch, left to the `MockData<T>` mapped type.
  - enrich-mock-inverted-range: `min > max` / inverted `rt$length`.
  - enrich-mock-small-pool: pool below a configured floor, off by default.
- Map is type-checked against `T` by the `MockData<T>` mapped type today regardless.

## Node model: per-field pools / ranges

One recursive node, uniform at every depth. Shape per field kind:

- string → `{ pool: string[] }`
- number → `{ pool: number[]; min?: number; max?: number }`
- `Date` → `{ pool: Date[]; min?: Date; max?: Date }`
- boolean / bigint → `{ pool: boolean[] }` / `{ pool: bigint[] }`
- array / rest tuple → `{ rt$items: <element node>; rt$length?: number | [number, number] }`
- fixed tuple → `{ rt$slots: [<node per slot>] }`: positional, fixed length, no `rt$length`
- `Map` → `{ rt$keys, rt$values: <node>; rt$size?: number | [number, number] }`
- `Set` → `{ rt$values: <node>; rt$size?: number | [number, number] }`
- object → `{ [K in keyof T]-?: <child node> } & { rt$optional?: number }`

- **`pool`**: pick a value at random from this list. Empty (`pool: []`) → draw from `min` / `max` instead.
- **`min` / `max`**: inclusive bounds (numbers, `Date`s).
- **`rt$items`**: element node for array (and rest-tuple) members. **`rt$slots`**: one node per fixed-tuple position.
- **`rt$length`**: array length, fixed (`3`) or `[min, max]` range. **`rt$size`**: the Map/Set equivalent.
- **`rt$optional`**: present-probability (0..1) for optional members on an object node.

## Where the map lives

- Mock mirror file at the type's **definition**: `src/models/user.ts` → `<genDir>/enriched/mock/src/models/user.ts`.
  Default: `src/.mion/enriched/mock/src/models/user.ts`. Holds `mock<Name>` consts.
- Layout rules (genDir, `rootDir`, one home per type): `rt-enrich-types` skill.
- `MockData<T>` is generated **demand-driven**: only for types consumed by a `createMockDataFn` call.

## Feeding it to `createMockDataFn<T>()`

Import the map from the mirror, pass it via `data` (plain, greppable wiring, no injection):

```ts
import {createMockDataFn} from '@mionjs/run-types/mocking';
import {mockUser} from '../.mion/enriched/mock/src/models/user';
import type {User} from '../models/user';

const makeUser = createMockDataFn<User>(undefined, {data: mockUser});
const sample = makeUser(); // realistic, type-valid User
```

- `data` rides the same options bag as `{ mock }`: `createMockDataFn<T>(undefined, { data, mock })`.
- No `data` → mocks mechanically, exactly as before.

End-to-end example (type, filled mirror, consumer) → [example.md](example.md). Read before filling a first map.

## Authoring checklist

- Map goes in the **definition's mock mirror file** (`<genDir>/enriched/mock/<rel>.ts`), not the consumer's file.
- Type it `MockData<T>` so structure is checked against `T`.
- `pool` for enumerable/realistic values (names, emails, tags). `min`/`max` for numeric and `Date` ranges.
- Keep every pool/range value **valid for the field's type + format**.
  enrich-mock-invalid-pool will reject `score: 150` against `TF.Number<{max: 100}>`.
- Keep mock pools out of production bundles: import them from tests/seeds only (normal tree-shaking handles it).
- Aim for a healthy pool size: design notes a floor around 50 for realistic variation.
  enrich-mock-small-pool is an off-by-default nudge.

[md]: https://github.com/MionKit/mion/blob/main/packages/run-types/src/enrich/mockData.ts
[cmd]: https://github.com/MionKit/mion/blob/main/packages/run-types/src/mocking/createMockData.ts
