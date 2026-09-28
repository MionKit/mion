---
type: fix
spec: guidelines
status: ready
created: 2026-09-28
---

# A standard type stops being "not data" as soon as any other file declares it too

## Intent

Only shapes the user wrote, plus the supported natives (Date, Map, Set, RegExp, Temporal, binary), are data.
Today the type reader decides "not data" purely by file location: a type is a standard built-in only when EVERY
declaration of it sits in TypeScript's own lib files. Any second declaration of the same name, in any file,
flips a built-in into a user shape that every family walks member by member. It does not matter whether the
declaration conflicts, adds members, or is a class, an interface or a `var`.

Reproduced in the Go resolver with one project file `globals.d.ts` (no node_modules involved):

| Extra declaration | `getRunTypeId<X>()` reads X as |
| --- | --- |
| none (`URL` from lib only) | not data (kind 20, not-data subKind) |
| `interface URL {}` (empty) | plain object, 14 members walked |
| `interface URL { href: string }` (same as lib) | plain object |
| `var URL: {...}` only | plain object |
| `interface Headers {}` | plain object |
| `interface Date {}` | still Date (supported natives are matched by name first) |
| `Widget` declared only there (interface + var) | plain object |
| `Emitter` declared only there (class) | user class |

Real projects hit this through runtime type packages. `@types/node` re-declares about 20 lib globals (URL,
URLSearchParams, Request, Response, Headers, Blob, File, FormData, ReadableStream, AbortController,
AbortSignal, TextEncoder, TextDecoder, Crypto, CryptoKey, Event, EventTarget, MessagePort, BroadcastChannel,
Performance, WebSocket), `bun-types` more. In the `packages/run-types` vitest project (tsconfig
`"lib": [..., "dom"]`, `"types": ["node"]`):

    interface Job { id: string; timer: NodeJS.Timeout; events: EventEmitter; headers: Headers; abort: AbortController }

| Call | Today |
| --- | --- |
| `getRunType<URL>()`, `<Headers>`, `<AbortController>`, `<TextEncoder>`, `<NodeJS.Timeout>` | kind 30 (object literal), walked member by member |
| `getRunType<EventEmitter>()` | kind 20 user class, 16 members |
| `getRunType<Blob>()` | build error MKR009: its `ReadableStream` re-instantiates itself |
| `createValidateFn<Job>()(realJob)` | `false` |
| `createJsonEncoderFn<Job>()(realJob)` | `{"id":"a","timer":{},"events":{},"headers":{},"abort":{"signal":{"aborted":false,"onabort":null}}}` |
| `createJsonDecoderFn<{url: URL}>()(json).url instanceof URL` | `false`, a plain object |
| `createRemoveUnknownKeysFn<{url: URL}>()` | RUK010 per URL / URLSearchParams method, then RUK004 (always throws) on `[Symbol.iterator]` |

Expected: each one is a not-data built-in, handled like `Int8Array` today.

## Cause (verified)

`declaringLibFile` (`ts-go-runtypes/internal/cachegen/runtype/typeid/typeid.go`), used by `LibDeclaredGlobalOf`
(`typeid/libglobal.go`), returns "" when any declaration sits outside the bundled lib. That rule exists so a
user adding fields to a lib interface keeps their shape, but it counts every declaration: an empty merge, a
`var`, or a package re-declaring the same members. Types that exist only outside lib (runtime handles such
as `NodeJS.Timeout`, `EventEmitter`) have no path to "not data" at all.

## Direction

The implementer plans the details and decides the rule. Constraints:

- A user's own augmentation that adds members to a lib interface was meant to stay data; decide whether that
  is still wanted, and if so only for declarations that add a member lib does not have.
- An empty merge, a `var`-only redeclaration, and a runtime package re-declaring lib's members must not flip
  a built-in.
- Runtime-only handles need their own answer: declarations from the runtime's type package (`@types/node`,
  `bun-types`, `@cloudflare/workers-types`, `@types/deno`...) could count like lib. A class exported by an
  ordinary installed library can be real data (a DTO), so "under node_modules" alone cannot mean "not data".
- Keep the TypeScript side (`DataOnly` / `DataOnlyStripped` in `packages/run-types/src/runtypes/dataOnly.ts`)
  in agreement.
- Blob's MKR009 should go away once Blob is not data; check no other platform type still hits it.

Tests: Go tests with one-file overlays for every row of the first table, plus a runtime-package overlay,
checking not data in validate, JSON and removeUnknownKeys at the root and one level deeper; a member-adding
user augmentation (if kept) and a DTO class from an ordinary package stay data. A `packages/run-types` feature
test with the `Job` example.

## Docs

The page that lists what counts as data (the not-data section of the runtypes guide): say that runtime types
from Node, Bun or Cloudflare count as not data, like the standard library.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Every row of both tables shows the expected behaviour.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
