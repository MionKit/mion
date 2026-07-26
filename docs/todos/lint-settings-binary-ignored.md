---
type: fix
spec: guidelines
status: todo
created: 2026-07-26
---

# The e2e fixture sets `settings.runtypes.binary`, which the lint plugin silently ignores

**Status:** todo
**Created:** 2026-07-26 (found while implementing [docs/done/getexepath-env-override.md](../done/getexepath-env-override.md))

The lint plugin deliberately does NOT accept a binary override through lint settings, but the
pre-publish e2e fixture passes one anyway. Nothing warns; the setting is simply dropped.

## Evidence

- [packages/ts-runtypes-devtools/src/eslint/index.ts](../../packages/ts-runtypes-devtools/src/eslint/index.ts)
  → `sessionOptions()` maps only `timeoutMs` and `tsconfig` out of `settings.runtypes`. Its comment
  is explicit that this is on purpose: "The resolver binary and working directory are deliberately
  NOT configurable … so a `binary`, `cwd`, or `socket` under `settings.runtypes` is ignored."
- [packages/ts-runtypes-devtools/test/eslint/plugin.test.ts](../../packages/ts-runtypes-devtools/test/eslint/plugin.test.ts)
  (`sessionOptions — timeoutMs and tsconfig are configurable`) pins that drop as intended behavior.
- But [container/pre-publish-e2e/apps/smoke-esbuild/eslint.config.mjs](../../container/pre-publish-e2e/apps/smoke-esbuild/eslint.config.mjs)
  sets BOTH ignored keys:
  ```js
  settings: {runtypes: {cwd: appDir, ...(process.env.RT_E2E_BINARY ? {binary: process.env.RT_E2E_BINARY} : {})}}
  ```
  and its header comment claims "RT_E2E_BINARY overrides for host runs" — which is not what happens.

Nothing is broken in CI (in-container the published `@ts-runtypes/bin` launcher resolves the real
platform binary, which is exactly what the e2e exists to prove). The defect is that a host run with
`RT_E2E_BINARY` set does NOT lint with that binary, contrary to the config's own comment, and that
`cwd` is dropped too, so the resolver runs in `process.cwd()` rather than `appDir`.

## Fix direction — pick one

1. **Make `settings.runtypes.binary` real** (the "tidier long-term surface" the getExePath todo
   floated). Thread it `sessionOptions()` → `LintSessionOptions` → `LintWorkerRequest` →
   `ensureConnection()` in [lint-worker.ts](../../packages/ts-runtypes-devtools/src/eslint/lint-worker.ts),
   mirroring how `tsconfig` already flows (read once, when the long-lived connection opens). Update
   the deliberate-drop comments in `index.ts` / `session-protocol.ts` and flip the transparency test.
   Decide `cwd` at the same time — the same config sets it and it is dropped for a stronger reason
   (the session's whole cwd model is "run where the linter runs"), so it may well stay dropped.
2. **Or drop the dead keys from the fixture** and point its host runs at the new `RT_BIN` instead
   (`RT_BIN` covers the lint lane by design), then fix the misleading comment.

Whichever way it goes, the fixture and the plugin must stop disagreeing.

## Done when

- The e2e fixture's lint config contains no setting the plugin ignores, and its comment matches
  what actually happens on a host run with `RT_E2E_BINARY` set.
- If option 1: a Vitest case proves a `settings.runtypes.binary` value reaches the resolver
  connection (and the transparency test is updated rather than deleted).
