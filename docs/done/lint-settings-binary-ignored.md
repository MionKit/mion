---
type: fix
spec: guidelines
status: done
created: 2026-07-26
completed: 2026-07-26
---

# The e2e fixture sets `settings.runtypes.binary`, which the lint plugin silently ignores

**Status:** done (option 2, plus a wider `cwd` / tsconfig finding; see [Implemented](#implemented))
**Created:** 2026-07-26 (found while implementing [docs/done/getexepath-env-override.md](getexepath-env-override.md))

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

## Implemented

**Option 2**, with the plugin's deliberate design left intact: `RT_BIN`
([docs/done/getexepath-env-override.md](getexepath-env-override.md)) is the supported lint-lane
binary hook, so the fixture no longer needs a key the plugin drops. The transparency test that pins
`binary` / `cwd` / `socket` as ignored stays unchanged.

Planning found the defect was **wider than the `binary` key**:

- **Both** lint configs set the ignored `cwd`, not just the eslint one (the oxlint config carried
  `"cwd": "apps/build-vite"`).
- Neither set `tsconfig`, which IS honored. Both linters are spawned with `cwd: <e2e root>`
  (`lint-all.mjs`, `test/lint-transport.test.mjs`), so the resolver searched upward from there for a
  config: it found the **monorepo's own** `tsconfig.json` on a host run, and nothing in-container.
  The apps' own tsconfigs were never read.
- `test/lint-transport.test.mjs`'s `WIRED = /runtypes|VL0\d\d/i` cannot tell a real finding from an
  engine failure, because a `broken-tsconfig` / CFG001 line matches it just as well as a `VL0xx`.

**Measured, not assumed (correction to an earlier draft of this section).** The dropped `cwd`
changed no diagnostic outcome. Reproducing the fixture's exact topology on the host with the REAL
oxlint CLI (linter spawned from a parent dir, app tsconfig reachable only through the setting), the
old shape and the new shape both emit the identical `VL011` — and so does the old shape with a
DECOY tsconfig planted above the linter's cwd, which is the host situation. The resolver roots an
inferred Program at the linted file, so a missing or unrelated project config does not break these
self-contained caveat files. So the fix is correctness-of-intent, not a repair of broken output: it
makes the lane read each app's real config, which matters the moment an app depends on options the
resolver takes from the project (`lib`, `paths`, `customConditions`) — exactly what the
`settings.runtypes.tsconfig` e2e case in `test/eslint/oxlint-e2e.test.ts` already pins. The
tightened CFG001 assertion below is a guard against that class of misconfiguration, not a fix for
an observed failure; no run in the topology experiment tripped it.

What landed:

- **`packages/ts-runtypes-devtools/src/eslint/session-protocol.ts`** — exported `LINT_SETTING_KEYS`,
  built from a `satisfies Record<keyof LintSessionOptions, true>` table so it stays exhaustive
  (the pattern `src/plugin-option-keys.ts` already uses for the bundler options). It lives in this
  dependency-free module so tests can import it without loading the plugin entry, which
  top-level-awaits a worker prewarm. `sessionOptions()` in `src/eslint/index.ts` is unchanged apart
  from its comment naming the list as the contract.
- **e2e lint configs** — `apps/build-vite/oxlintrc.e2e.json` and
  `apps/smoke-esbuild/eslint.config.mjs` drop the ignored keys and set the honored `tsconfig` at
  each app's own config (e2e-root-relative for oxlint, absolute from `import.meta.url` for eslint),
  with comments that describe what actually happens.
- **e2e spawners** — `lint-all.mjs` and `test/lint-transport.test.mjs` forward `RT_E2E_BINARY` to
  the linter child as `RT_BIN` (resolved absolute, since the child runs in the e2e root), so the
  fixture keeps ONE host knob and it now reaches the lint lane for real.
- **`test/lint-transport.test.mjs`** — a `CFG001` / `broken-tsconfig` in the output now FAILS the
  lane: a config error means our fixture is misconfigured. The missing-platform-binary engine line
  stays tolerated for host runs, and cannot collide (only a live resolver emits CFG001).
- **Test** — `packages/ts-runtypes-devtools/test/eslint/e2e-lint-settings.test.ts` reads both REAL
  e2e configs and asserts every key under `settings.runtypes` is in `LINT_SETTING_KEYS`, and that
  the tsconfig each names exists. The e2e lanes only run inside the release-gate container, so this
  is the pin that runs in the normal suite. Its key scan is deliberately FLAT: the original defect
  injected `binary` through a spread, which a top-level-only scan walks straight past (verified by
  reintroducing the spread and watching the test fail).
- **Env contract** — the `RT_E2E_BINARY` rows in [scripts/lib/env.mjs](../../scripts/lib/env.mjs)
  and [.env.sample](../../.env.sample) note that the lint lanes receive it as `RT_BIN`.

## Verification (2026-07-26)

The containerized e2e lane (`pnpm rtx release e2e`) could NOT run in this session, and not for want
of tooling: podman 4.9.3, Go 1.26 and the workspace are all in place, but **no image is reachable**.
A local build needs a Docker Hub base image and the registry's blob CDN
(`production.cloudfront.docker.com`) is refused by the egress policy with a 403, while
`ghcr.io/mionkit/tsrt-e2e` is private and this session has no `GHCR_PAT` (there is no `.env`).
Neither is routed around.

What ran instead, on the host, with the REAL linter rather than a mock:

- **The fixture's lint topology, reproduced end to end** (scratchpad script, not committed): real
  `oxlint` spawned from a parent dir linting a nested app, old shape vs new shape, plus a decoy
  tsconfig round. Results are in the correction note above; the new shape resolves its
  e2e-root-relative `tsconfig` correctly and never trips CFG001.
- **RT_BIN through the whole lint lane** — the finding that earned a permanent test. Added to
  `test/eslint/oxlint-e2e.test.ts`: with `RT_BIN` pointed at the real binary the run produces the
  baseline `VL011`; pointed at a missing path the launcher's own
  `RT_BIN=/nonexistent/… does not exist` reaches oxlint's output and fails the run. The same config
  carries a bogus `settings.runtypes.binary`, so one test now contrasts the ignored setting with the
  honored env var. This is the lint-lane half of `RT_BIN` that the unit tests could not reach.
- Full JS suite, `pnpm run lint`, `pnpm run check-format`.

Still unexercised here: the published-tarball install chain (verdaccio), the multi-bundler matrix,
and the ESLint transport (eslint is not a host dependency; it shares the plugin and session code
with the oxlint lane, which did run). Those need the release gate's container.

**Not done:** making `settings.runtypes.binary` real (option 1), and warning consumers about
unknown `settings.runtypes` keys — the latter changes behavior for every host and deserves its own
spec if wanted.
