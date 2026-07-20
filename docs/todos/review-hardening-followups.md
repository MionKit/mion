# Review hardening follow-ups — client-side strict check, backend coupling, paramNames arity

**Status:** todo — R17/R33/R34 of [migration-review-findings.md](migration-review-findings.md).
**Created:** 2026-07-20

## R17 — client-side strictTypes pre-validation

`client/lib/validation.ts` only calls `isType`/`typeErrors`; on master strictness was baked
into the server-compiled `isType`, so strict violations failed fast client-side — now they
round-trip to the server. The `hasUnknownKeys`/`unknownKeyErrors` fns already ride the
metadata lane (`core/routerUtils.ts`). BLOCKER for a naive fix: the client does not know
whether the server has `strictTypes` enabled (enforcing unconditionally would reject
payloads a lax server accepts). Plan: ship the effective strictTypes flag (per method or
router-level) in the methods metadata, then call huk/uke client-side only when set; pin
with a client spec against the managed test server.

## R33 — core↔run-types backend coupling rides an import side effect

`installJitLookupBackend` runs at `@mionjs/run-types` module scope; core's `getJIT`/pure-fn
lookups silently return `undefined` until then. No package declares `sideEffects`, so
bundlers currently keep the import — but the contract is implicit. Plan: fail loud in core
when `getJIT`/`getCompiledPureFn` are called with no backend installed (clear error naming
the import that installs it), and document the contract in core's README/docblock.

## R34 — paramNames from Function.prototype.toString() parsing

An EMPTY parsed `paramNames` silently disables client-side validation and param
serialization (`client/lib/validation.ts` + `client/lib/serializer.ts` early-return), so
any transpilation that changes source arity kills client pre-validation unnoticed. Plan:
derive the param COUNT from the params runtype (build-time-known, arity-stable) and use
source parsing only for display names; pin a spec that count survives the supported build
matrix (esbuild/vite defaults).
