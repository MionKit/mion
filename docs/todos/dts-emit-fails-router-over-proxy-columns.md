---
type: fix
spec: guidelines
status: ready
created: 2026-08-27
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

## Direction

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
