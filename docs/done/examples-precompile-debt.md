# Examples pre-compile debt — the `check-types` CI gate is green

**Status:** done
**Created:** 2026-07-21 (split out of [examples-and-website-refresh.md](examples-and-website-refresh.md))
**Shipped:** 2026-08-20

`packages/examples` is now typechecked in CI and sits at **0 errors**, down from 38.

## What the baseline actually was

The spec listed four blockers. One had already dissolved: **blocker #2 (friendly-errors
format-param rework) no longer exists** — those example files were deleted when the friendly-errors
pages were rewritten. `packages/type-formats`, which blocker #4 also named, is gone too.

Real baseline: **38 errors** — 27 in the examples' own doc snippets, 11 leaking from `@mionjs`
source because `tsconfig.check.json` resolves `@mionjs/*` to SOURCE.

## The gate: fast lane, everything fixed

The spec proposed sidestepping the source-package errors with a build-then-check lane
(`pnpm -r build` then `tsc -p tsconfig.json`). **Not taken.** It would add a full workspace build to
CI, contradict "never run `pnpm run build` during development", and leave 11 real errors unfixed.

Instead the existing no-build `check-types` is the gate and every error was fixed. It also turned
out the source-package errors needed **no new dependency**, which was the main argument for the
build lane.

### Source-package fixes (5 of the 11 were real defects)

- **6× `Bun` namespace missing.** Not a defect: `bun-types@1.3.12` was already installed and
  `packages/platform-bun/tsconfig.json` already lists it, but the root tsconfig sets
  `types: ["node"]` and the check config inherited that. Added `"types": ["node", "bun-types"]`.
- **3× `Uint8Array<ArrayBufferLike>` not assignable to `BodyInit`** — `platform-bun/src/bunHttp.ts:173`,
  `platform-cloudflare/src/cloudflareHandler.ts:128`, `platform-vercel/src/vercelHandler.ts:124`.
  `getBufferView()` is typed `Uint8Array`, which since TS 5.7 means `Uint8Array<ArrayBufferLike>`,
  and `ArrayBufferLike` admits `SharedArrayBuffer`. Added `toResponseBody()` in
  `packages/core/src/binary/dataView.ts` — one documented narrowing instead of three casts. Sound
  because the DataView serializer only ever allocates a plain `ArrayBuffer`.
- **2× `rtFns` does not exist on `AnyHandlerDef`** — `router/src/lib/reflection.ts:95-96`.
  `getHandlerReflection` reads `def.rtFns` but was typed with the full union including
  `RawMiddleFnDef`, which has no `rtFns` (raw middleFns declare no extra params and go through
  `getRawMethodReflection`). Narrowed to `Exclude<AnyHandlerDef, RawMiddleFnDef>`.

That last one is worth noting: it was invisible to the router package's own `tsc`, because
composite + project references refuse `--noEmit` without a build. The examples lane is currently the
only thing typechecking that source at all.

### Example fixes (27 errors, 14 files)

- **Placeholder module imports** (`'Logger'`, `'MyAuth'`, `'MyModels'`) → real modules:
  `src/router/myAuth.ts` and `src/router/myModels.ts` were added as stand-ins, and `server.routes.ts`
  defines its logger inline.
- **Undeclared context/app members** (`db`, `cloudLogs`, `Pet`, `Data`) → `full-example.app.ts` grew
  `Pet`, `SomeData`, `myDbService` and `myCloudLogsService`, so the snippets that reference an app
  read naturally instead of inventing one.
- **`serve-{node,bun,aws-lambda,google-cf}.ts`** → `.ts` extension added to the side-effect import.
- **`extending-routes-and-middleFns.routes.ts`** documented an API shape that no longer exists
  (`{route: fn}` / `{middleFn: fn}` keys); rewritten against `{type, handler}`. It is referenced by
  no page, but it compiles now rather than rotting.
- **`overview-runtypes-example.ts`** declared its own `User`/`NewUser` and then called the shared
  store, producing two same-named identities. Made self-contained — its point is validation and type
  restoration, not storage.
- **`_homepage/home-client.ts`** — the error is *deliberate* (a twoslash demo of "id must be a
  number"). Marked `@ts-expect-error`, which also fails the build if it ever stops erroring; better
  than excluding the file the way `twoslash-test` is excluded.
- **`client/cancellation-timeout.ts`** — see below.

## Found on the way: the client's error union is incomplete

`cancellation-timeout.ts` was written the natural way and did not compile: the client raises
`request-timeout` (and six more transport errors) at runtime, but `HandlerErrors` only carries the
handler's own errors plus `ValidationError`, so `error.type` cannot narrow to them. The example
ships an `as string` cast plus a pointer, and the real fix is filed as
[../todos/client-transport-error-types.md](../todos/client-transport-error-types.md). Widening a
published error union was out of scope here.

## What stays excluded

`src/twoslash-test` (deliberate-error demos) and `run-types/comparison-typia.ts` (needs uninstalled
`hono`/`typia`) — unchanged, and documented in the config header.

## Acceptance

- ✅ `pnpm run check-types-examples` → 0 errors.
- ✅ Runs in CI on every PR (`.github/workflows/pull-requests.yml`).
- ✅ No workspace build required.
