# Mock format registry silently empty without a `ts-runtypes/formats` side-effect import

**Status:** todo
**Type:** bug — silent mock-soundness loss (mock ⇏ validate) depending on import elision
**Created:** 2026-07-29
**Found by:** the JSON Schema investigation prototype
(`packages/ts-runtypes/test/features/jsonSchemaInput.proto.test.ts`; see
`docs/investigations/json-schema/02-phase2-first-class-input.md`)

## The bug

The per-kind format MOCK functions register only as a **side effect of importing the
formats subpath** (`packages/ts-runtypes/src/formats/index.ts:17-23`):

```ts
import '../mocking/mockStringFormat.ts';
import '../mocking/mockNumberFormat.ts';
import '../mocking/mockBigIntFormat.ts';
```

`createMockDataFn` itself never loads them. When the registry is empty, the mock walker
falls back to the **kind-default** generator for a format-branded node (`mockRegistry.ts`
returns `undefined` → plain string/number/bigint), so `createMockDataFn<T>()` produces
values that **fail `createValidateFn<T>()`** — junk strings for `UUIDv4`/`Email` fields,
unbounded numbers for `Number<{min: 0; max: 130}>`, etc. No warning, no throw; the mock
just quietly stops honoring formats while the compiled validators still enforce them.

## Why real consumers hit it

Format types are **types**. A consumer writing

```ts
import {Email, UUIDv4} from 'ts-runtypes/formats'; // used only in type positions
interface User { id: UUIDv4; email?: Email }
const mockUser = createMockDataFn<User>();
```

has every import of the formats module in **type position only**, so TS (without
`verbatimModuleSyntax`) and every bundler's type-stripping **elide the import** — and with
it the registration side effect. The failure is probabilistic-looking (the mock is junk
but shape-valid, so only format checks fail) and environment-dependent (any other module
value-importing formats masks it), which is the worst kind of soundness break.

## Evidence

Reproduced in-repo during the JSON Schema investigation: a test importing
`import type * as TF from '@ts-runtypes/core/formats'` (erased) had **500/500** mocks of
a uuid/email/bounded-number object fail validation; adding the bare side-effect import
made mock⇄validate sound (25/25). `test/features/composeBuilders.test.ts:41` already
carries the workaround line (`import '@ts-runtypes/core/formats';`), which shows the
footgun is known internally but is not documented or defended for consumers.

Note `test/features/mockSoundness.test.ts` never catches this because its own imports
load the formats module for the whole test process.

## Fix plan (pick one, first is preferred)

1. **Make `createMockDataFn` self-sufficient**: import the three `mocking/mock*Format.ts`
   registration modules from `mocking/createMockData.ts` (or `mockType.ts`) directly.
   They live under `src/mocking/` already — no dependency from the core entry on the
   formats subpath types is needed, so the "bundlers can drop the mock subtree" property
   is preserved (the registrations ride the mock subtree itself, which is only pulled in
   by `createMockDataFn` consumers).
2. Alternatively (if 1 has a bundle-size angle I'm missing): make the walker **throw** (or
   emit a loud dev-mode warning) when it meets a `formatAnnotation` with no registered
   mock fn for that kind, instead of silently generating a base-kind value — turning the
   silent soundness loss into an actionable error pointing at the side-effect import.
3. At minimum: document the required side-effect import on the website mock page + add a
   lint-rule/diagnostic when a program demands mock for a format-branded type and no
   value-import of the formats subpath exists.

A regression test should mock a format-branded type in a file whose only formats import is
type-only, in an isolated vitest project (import graph isolation is the trigger), and
assert mock⇄validate soundness.

## Marker test coverage rule

Any new tests must cover both `getRunTypeId<T>()` and `getRunTypeId(value)` shapes if they
touch the marker API (the soundness repro above only needs `createMockDataFn` +
`createValidateFn`, both already exercised in both shapes by existing suites).
