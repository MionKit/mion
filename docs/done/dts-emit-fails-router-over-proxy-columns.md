---
type: fix
spec: guidelines
status: done
created: 2026-08-27
updated: 2026-08-27
---

# Declaration emit fails (TS4023) for a router built over proxy columns

## Intent

A project that exports a mion router whose handlers touch proxy-built drizzle columns cannot
emit `.d.ts` at all. TypeScript reports TS4023 and sets `emitSkipped`, so nothing is written.
That blocks any consumer who publishes a library (or uses `composite` project references) on top
of `@mionjs/drizzle-orm-<dialect>-core`. It also blocks mion itself the moment a package wants to
export a router built that way. Make declaration emit work.

## Evidence

Found while measuring the model pipeline's type cost. Five variants compiled in-process with
`declaration: true, emitDeclarationOnly: true`, resolving the workspace through the `source`
export condition:

```
A plain drizzle table + router     emitSkipped=false  errors=0
B proxy table + router             emitSkipped=true   errors=2
C refined table + router           emitSkipped=true   errors=2
D refined table, types only        emitSkipped=false  errors=0
E refined table exported as const  emitSkipped=false  errors=0
```

Both errors on B and C:

```
TS4023 Exported variable 'usersApi' has or is using name '__rtFormatName' from external
module "<repo>/packages/ts-runtypes/src/runtypes/typeFormat" but cannot be named.
TS4023 Exported variable 'usersApi' has or is using name '__rtFormatParams' from external
module "<repo>/packages/ts-runtypes/src/runtypes/typeFormat" but cannot be named.
```

What the matrix tells you:

- It is NOT caused by `refineTableType`. Plain proxy columns (case B) already fail; refinement
  (case C) just fails the same way.
- It is NOT the model types on their own. Exporting `InferSelect` / `InferInsert` / `InferUpdate`
  aliases (case D) and exporting the table value itself (case E) both emit fine.
- The trigger is the exported ROUTER value, whose inferred type carries the format sentinel
  symbols into a position the declaration emitter has to name.

## Repro

Compile this with `declaration: true` against the workspace and check `emitSkipped`:

```ts
import {pgTable, varchar} from '@mionjs/drizzle-orm-pg-core';
import type {InferSelect} from '@mionjs/drizzle-orm-pg-core';
import {RpcError} from '@mionjs/core';
import {initMionRouter, route} from '@mionjs/router';

const users = pgTable('users', {name: varchar('name', {length: 100}).notNull()});
type User = InferSelect<typeof users>;
const store = new Map<string, User>();

export const usersApi = await initMionRouter({
  users: {
    select: route((_ctx, name: string): User | RpcError<'nf'> =>
      store.get(name) ?? new RpcError({publicMessage: 'x', type: 'nf'})),
  },
});
```

The measurement harness in [packages/type-budget/](../../packages/type-budget/) already builds
in-process resolving programs; the same pattern with `declaration: true` reproduces this in a
few lines.

## What shipped (2026-08-27)

Fixed in the same pull request as the type-budget harness, after the delegated background
session failed to initialise.

**Cause.** A format's sentinel members are symbol-keyed, and a symbol-keyed member can only be
printed into a `.d.ts` when the emitting file can name the symbol. TypeScript will not invent an
import for one. Formats normally print by alias
(`import("@ts-runtypes/core/formats").String<{maxLength: 100}>`), which is why cases D and E were
fine. A mion router's public API maps the handler types and loses that alias, so the brand got
printed structurally, hit the bare `[__rtFormatName]` key, and aborted the whole emit.

Confirmed by adding `import type {__rtFormatName, __rtFormatParams} from '@ts-runtypes/core'` to
the failing file: emit then succeeded. The emitting file's scope was the whole problem.

**Fix.** Name the brand. In
[packages/ts-runtypes/src/runtypes/typeFormat.ts](../../packages/ts-runtypes/src/runtypes/typeFormat.ts)
the two inline sentinel objects became exported interfaces:

```ts
export interface FormatBrand<Name extends string, Params extends object> {
  readonly [__rtFormatName]?: Name;
  readonly [__rtFormatParams]?: Params;
}
export interface NominalBrand<BrandName extends string> {
  readonly [__rtFormatBrand]: BrandName;
}
```

Both are re-exported from the package root and the `formats` subpath, which is what the emitted
declarations reference. Structurally identical to what they replace, so format detection by key
presence and the Go resolver's declaration-name matching are untouched. The structural expansion
now prints a reference to a nameable interface instead of a bare symbol key.

Exporting the sentinel keys from `typeFormat.ts` was tried first and does NOT work; the
intermediate state (TS4023 became TS2883) is what named the real requirement.

**Cost.** Naming the brand adds 28 net instantiations across the model chain (steps 2, 3 and 6,
plus the downstream consumer lane). That is a deliberate, one-off upward step of the type-budget
ratchet, recorded in the header of
[packages/type-budget/test/modelPipeline.compile.test.ts](../../packages/type-budget/test/modelPipeline.compile.test.ts).

**Test.**
[packages/type-budget/test/declarationEmit.test.ts](../../packages/type-budget/test/declarationEmit.test.ts)
covers all four shapes and asserts `emitSkipped === false` with zero declaration diagnostics,
plus that the emitted declaration still carries the format brand and the refined bounds. The
three dialect packages share one refine implementation (pinned by the parity spec), so pg
coverage carries the other two.

## Direction (as filed)

- The sentinel keys live in
  [packages/ts-runtypes/src/runtypes/sentinelKeys.ts](../../packages/ts-runtypes/src/runtypes/sentinelKeys.ts)
  and are consumed by
  [typeFormat.ts](../../packages/ts-runtypes/src/runtypes/typeFormat.ts), which imports them
  type-only and does not re-export them. The root
  [src/index.ts](../../packages/ts-runtypes/src/index.ts) does export them (`export type
  {__rtFormatName, __rtFormatParams}`).
- **Adding `export type {...} from './sentinelKeys.ts'` to `typeFormat.ts` was tried and does
  NOT fix it.** Do not stop there. Work out why the emitter resolves the symbol to typeFormat's
  scope in the first place, and what declaration site would let it write a reference.
- Worth checking whether the sentinels being `unique symbol` declarations (rather than, say, a
  branded string key) is what makes them unnameable in this position, and whether the router's
  own types widen the sentinel into a spot the emitter cannot alias.
- Whatever the fix, it must keep the format brands working: detection by key presence
  (`typeof __rtFormatName extends keyof T`) is load-bearing across the formats machinery.

## Done when

A spec proves declaration emit succeeds for case B and case C (a router over proxy columns, and
over refined ones), with the emitted `.d.ts` still carrying the format-branded model types. The
test must assert `emitSkipped === false` and zero declaration diagnostics, so the regression
cannot come back silently. The three dialect packages behave identically (the refine files are
byte-identical by contract), so covering pg is enough if the parity spec still passes.
