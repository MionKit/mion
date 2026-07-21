# Review hardening follow-ups — client-side strict check, backend coupling, paramNames arity

**Status:** done — R17/R33/R34 of [migration-review-findings.md](migration-review-findings.md).
Shipped on `claude/ts-runtypes-migration-todos-us21ib-engine-cleanup` (PR3, the "rest" PR).
**Created:** 2026-07-20

## R17 — client-side strictTypes pre-validation ✅

`client/lib/validation.ts` only called `isType`/`typeErrors`, so strict-violation payloads
round-tripped to the server. Fixed: the effective `strictTypes` flag (route ?? router) already rides
the methods metadata (`getSerializableMethod` ships `options`), so `getTypeErrors` now runs the
compiled `hasUnknownKeys`/`unknownKeyErrors` fns locally when it is set — mirroring the server's
dispatch gate. Added a strictTypes test-server route (`createUserStrict`) and a client spec
(`client/src/lib/validation.spec.ts`) proving extra-key payloads are rejected locally. Corrected the
stale `strictTypes` docblock in `core/src/types/method.types.ts`.

## R33 — core↔run-types backend coupling rides an import side effect ✅

`installJitLookupBackend` runs at `@mionjs/run-types` module scope; core's `getJIT`/`getCompiledPureFn`
silently returned `undefined` until then. Fixed: those lookups now throw a clear `MissingJitBackendError`
naming the missing `@mionjs/run-types` import when no backend is installed; the existence probes
(`hasJitFn`/`hasPureFn`/`getPureFn`) stay quiet. Added `isJitLookupBackendInstalled()`, documented the
contract in the jitUtils docblock, and pinned it with a core spec (`core/src/jit/jitUtils.spec.ts`,
runs with no backend installed).

## R34 — paramNames from Function.prototype.toString() parsing ✅

An empty parsed `paramNames` silently disabled client-side validation + param serialization (both
early-return on `length === 0`), so any transpilation that changed source arity killed pre-validation
unnoticed. Fixed: `getReflectionFromMarkers` now derives the authoritative param COUNT from the params
tuple runtype (`getParamCountFromRunType`, build-time-known/transpile-stable) and reconciles the parsed
names against it (`reconcileParamNames`) — degraded slots fall back to `param{i}`. Source parsing is
display-only now. Canary spec feeds real markers a degraded-source handler and asserts the arity
survives (`run-types/src/mionAdapter.spec.ts`).
