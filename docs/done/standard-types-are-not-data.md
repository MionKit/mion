---
type: fix
spec: full-plan
status: done
created: 2026-10-01
---

# Types the platform declares are never data, however many files redeclare them

## Decisions (settled, do not reopen)

1. Data is what the user wrote, plus the supported natives (Date, Map, Set, Temporal). RegExp and binary are not data.
   Anything else needs explicit support or it is not data. A class the platform declares is not data.
2. The test is where a type is declared, never what it is called. Declared by the user or an ordinary library: data.
   Declared by the platform: not data. "Platform" is the bundled TypeScript lib plus the environment the project
   loads: what its tsconfig `types` list (or any `/// <reference types>`, a dependency's included) resolves to, and the files those pull
   in with `/// <reference>`. That covers `@types/node`, `bun-types`, `@cloudflare/workers-types` and the like with no
   list and no folder test. Settled limits: an ambient `declare module "x"` class in a loaded package counts
   (`EventEmitter`), `types: ["*"]` loads every `@types` package, and with no `types` list only the lib counts.
3. Behaviour is unchanged: a not-data type at the root makes the function throw, as a property it is dropped and the
   build says so.
4. `DataOnly<T>` in TypeScript cannot see where a class was declared. Go is the single source of truth. This is a
   documented limit: no generated list, no fixed strip list. The consequence stays: `createValidateFn<DataOnly<T>>()`
   requires a member that `createValidateFn<T>()` drops, and a decoder typed `DataOnly<T>` promises a member the decoded
   value never has. The earlier todo about it was closed by this decision (its "keep the gap and say so" option), with the
   validation page naming the kinds of class affected instead of listing them.

## Problem

The resolver calls a type not data only when EVERY declaration of it sits in the bundled lib
(`declaringLibFile`, `LibDeclaredGlobalOf`). Any other declaration flips it to a user shape that every family walks:

| Extra declaration | `getRunTypeId<X>()` reads X as |
| --- | --- |
| none (`URL` from lib only) | not data |
| `interface URL {}` (empty) | plain object, 14 members walked |
| `interface URL { href: string }` (same as lib) | plain object |
| `var URL: {...}` only | plain object |
| `interface Headers {}` | plain object |
| `interface Date {}` | still Date (supported natives are matched by name first) |
| `Widget` declared only there (interface + var) | plain object (correct, stays data) |
| `Emitter` declared only there (class) | user class (correct, stays data) |

`@types/node` redeclares about 20 lib globals, and declares types lib never had (`NodeJS.Timeout`, `EventEmitter`).
In the `packages/run-types` vitest project (`"types": ["node"]`), with
`interface Job { id: string; timer: NodeJS.Timeout; events: EventEmitter; headers: Headers; abort: AbortController }`:

| Call | Today |
| --- | --- |
| `getRunType<URL>()`, `<Headers>`, `<AbortController>`, `<TextEncoder>`, `<NodeJS.Timeout>` | object literal, walked member by member |
| `getRunType<EventEmitter>()` | user class, 16 members |
| `getRunType<Blob>()` | build error MKR009 (`ReadableStream` re-instantiates itself) |
| `createValidateFn<Job>()(realJob)` | `false` |
| `createJsonEncoderFn<Job>()(realJob)` | `{"id":"a","timer":{},"events":{},"headers":{},"abort":{"signal":{...}}}` |
| `createJsonDecoderFn<{url: URL}>()(json).url instanceof URL` | `false`, a plain object |
| `createRemoveUnknownKeysFn<{url: URL}>()` | RUK010 per method, then RUK004 (always throws) on `[Symbol.iterator]` |

Build errors and warnings today, with `createRemoveUnknownKeysFn<{field: X}>()`:

| `X` | Errors | Warnings |
| --- | --- | --- |
| `URL` | RUK004 `[iterator]` | RUK010 append, delete, forEach, get, getAll, has, set, sort, toJSON, toString |
| `URLSearchParams` | RUK004 `[iterator]` | RUK010 append, delete, forEach, get, getAll, has, set, sort, toString |
| `Headers` | RUK004 `[iterator]` | RUK010 append, delete, forEach, get, getSetCookie, has, set |
| `NodeJS.Timeout` | RUK004 `[toPrimitive]` | RUK010 close, hasRef, ref, refresh, unref |
| `EventEmitter` | RUK004 `[captureRejectionSymbol]` | none |
| `AbortController` | none | RUK010 abort, addEventListener, dispatchEvent, removeEventListener, throwIfAborted |
| `TextEncoder` | none | RUK010 encode, encodeInto |
| `Blob`, `Request` | MKR009 in every family | none |

Expected: every row is the not-data handling, which is RUK015 (shared, Warning) for removeUnknownKeys, with no RUK004,
RUK010 or MKR009.

## Plan

Go, `ts-go-runtypes/internal/cachegen/runtype/typeid/` (`libglobal.go`, `typeid.go`). Rename `LibDeclaredGlobalOf` and
`declaringLibFile` so the names say "platform declared", and update every comment (callers: `NotDataBuiltinOf`,
`binaryViewClassRef`, `serialize.go`, `typeid.go`).

A symbol flagged interface or class is platform declared when:

- At least one declaration is a platform declaration: in the bundled lib, or in an environment file (loaded through the
  tsconfig `types` list, any `/// <reference types>`, or a `/// <reference>` from one of those) that is a
  script file (which covers `declare module "events"`) or sits inside a `declare global` block. A class a loaded package
  exports from a module stays data, and a library the code imports is never environment.
- No other declaration adds a member. A non-platform declaration that is a `var`, function or namespace, or an
  interface/class whose member names all exist in the platform declarations (an empty merge, a re-declaration), does not
  flip the symbol. One that adds a member the platform lacks, or extends something, keeps the symbol the author's data.
- A symbol with no platform declaration stays data.

Supported natives are still matched by name first, so `interface Date {}` stays Date. Blob's MKR009 goes away once Blob
is not data; check no other platform type still hits it.

## Tests

- Go, one-file overlays, paired static and value call shapes: every row of the first table; a runtime-package overlay
  (script file with `declare module "events"`, a `declare global` block, `NodeJS.Timeout`, `EventEmitter`, `URL`
  redeclared); a DTO class from an ordinary module package and a member-adding user augmentation stay data. Each case
  is not data in validate, JSON and removeUnknownKeys, at the root and one level deeper. RUK015 only, no RUK004, RUK010
  or MKR009 for the types in the third table.
- JS: a `packages/run-types` feature test with the `Job` example.
- Not a fuzz candidate: a fix. The DataOnly fuzz oracle keeps drawing no platform class because of decision 4.

## Docs

- Write the rule where the next reader looks: `libglobal.go`, the "decided once" bullet of `ts-go-runtypes/CLAUDE.md`,
  and the limit in `dataOnly.ts` (header, `DataOnlyNative`, the stale "validated structurally" line). Fix the stale
  comments in `libdrop_test.go`, `dataonly.compile.test.ts` and `dataOnlyOracle.ts`.
- Website: one sentence in the note at the top of the runtypes validation page, that built-ins from the standard library
  and from Node, Bun or Cloudflare types are not data, and that `DataOnly<T>` still shows their shape in the editor.

## Done when

- Every row of the three tables shows the expected behaviour, and the listed errors and warnings are gone.
- Lint, format, typecheck, Go and JS tests pass. The docs and comments simplification passes ran, each committed on its own.

## What shipped

- `typeid.platformDeclaredGlobalOf` (called from `NotDataBuiltinOf`) replaces the old lib-only test (`libglobal.go`);
  `declaringLibFile` is gone. `binaryViewClassRef` passes the lib-only flag, since its name must exist as a global in
  every runtime.
- The environment is `program.EnvironmentFile` (`compiler/program/environment.go`), built once per Program from the
  compiler's type-reference resolutions and closed over `/// <reference>`, handed to the cache with `Cache.SetEnvironment`
  on every program swap. A first cut guessed from the path (a `.d.ts` under `/node_modules/`); review showed it caught
  an ordinary library's globals and ambient modules and depended on where a package sat on disk, so it was replaced.
  Tests pin the boundary both ways: a package outside `types`, an imported library's globals and ambient module class,
  a `types` package outside `node_modules`, a reference chain, `types: ["*"]`, no `types` list, a first-party
  `/// <reference types>`, and a dependency's (`program/environment_test.go`, on real files: `@types/express` loads
  `node` this way, and the silent-`any` check still reports a name nothing loads as `MKR013`).
- `ClassRef.Builtin` for a runtime-package type that is no global (`EventEmitter`) is its declared name, so the footer's
  `classType = globalThis.EventEmitter` is undefined. Nothing reads `classType` of a not-data type.
- A member counts as added by name, so an extra overload of a platform method is a restatement; members inherited by a
  platform declaration (`dispatchEvent` on `AbortSignal`) count as the platform's, found through the checker.
- Tests: `typeid/platform_declared_test.go` (one static and one value test per intent, a one-level-deeper check, form
  equivalence, binary views restated by a runtime package), `compiler/resolver/libdrop_test.go` (every family, both call
  shapes, property and root, Info and Warning levels, `URL`, `URLSearchParams`, `Headers`, `AbortController`,
  `TextEncoder`, `Blob`, `Request`, `NodeJS.Timeout`, `EventEmitter`; user classes stay data), a `platformClass` trigger in
  `TestNestedDiagCorpus`, shared overlay files in `testfixtures/platform.go`, and
  `packages/run-types/test/features/platformTypesNotData.test.ts` (the `Job` example and Blob / Request under the real
  `@types/node`).
- A typed array a runtime package restates with no new member now keeps its own lib name as `classRef` instead of the
  `Uint8Array` stand-in; one that adds a member still gets the stand-in.
- The rule and the `DataOnly<T>` limit are written in `libglobal.go`, `ts-go-runtypes/CLAUDE.md`, `dataOnly.ts` and the
  runtypes validation page.
