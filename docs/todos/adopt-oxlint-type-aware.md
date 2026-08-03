---
type: chore
spec: full-plan
status: blocked
created: 2026-07-04
updated: 2026-08-03
---

# Adopt `oxlint --type-aware` for this repo's own source

**Status: BLOCKED until 2026-08-21 — do not start before that date.** The adoption needs
`oxlint@1.75.0` (the first stable type-aware line, published 2026-07-21 23:21 UTC) plus its
paired `oxlint-tsgolint`, and the repo's `minimumReleaseAge: 43200` (30 days) in
[`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) blocks installing it until **2026-08-21**.
On/after that date this is a turnkey `full-plan` spec: the scope was measured on 2026-07-24
and the resolutions are written out below.

**History:** the last surviving item of the OXC toolchain migration follow-ups
(parent: [`docs/done/oxc-toolchain-migration.md`](../done/oxc-toolchain-migration.md); points 1
(rolldown) and 2b (esbuild) shipped in [PR #191](https://github.com/MionKit/ts-run-types/pull/191),
see [`docs/done/scope-rename-ts-runtypes-org.md`](../done/scope-rename-ts-runtypes-org.md); the
Next.js item moved to [`docs/maybe/next-js-support.md`](../maybe/next-js-support.md) on
2026-07-22). The old `oxc-migration-followups.md` was dropped on 2026-08-01 (commit `e0d36971`)
as "not adopting"; that call was reversed on 2026-08-03 — we are adopting, just not until the
stable engine ages in. This file re-files the remaining work single-topic, carrying the
2026-07-24 measurements.

## What this is (and is not)

**Orthogonal to RunTypes' own lint plugin.** `oxlint --type-aware` turns on oxlint's *own*
type-aware lint rules (no-floating-promises, no-misused-promises, await-thenable, …), powered by
oxlint's bundled tsgolint. It is a dev-hardening knob for linting **this repo's own source**. It
does NOT touch, use, or depend on the RunTypes lint plugin (`@ts-runtypes/devtools/eslint`) —
that is a *separate* oxlint JS plugin which surfaces RunTypes compiler diagnostics through our
own resolver binary. Toggling `--type-aware` changes only which generic TypeScript lint rules run
in CI; our plugin is unaffected either way.

Nothing type-aware runs today, so it is pure lint-coverage gain — but adopting it means enabling
the rules and fixing whatever they flag.

## Investigation (2026-07-24)

Installed the pre-stable engine on a throwaway basis (`oxlint-tsgolint@0.22.0`, which pnpm
resolves as an optional peer of the then-pinned `oxlint@1.68.0`) and ran `oxlint --type-aware`
across the real linted scope to size the adoption. Fully reverted afterward — no dependency or
config change was committed.

### What was measured

`--type-aware` with the existing config ([`.oxlintrc.json`](../../.oxlintrc.json) has
`categories.correctness: "error"` and no other categories enabled) turns on only the
correctness-category type-aware rules. The full-scope run flagged **6 findings across 4 files**:

| Rule | Site(s) | Verdict |
|------|---------|---------|
| `no-implied-eval` ×2 | `packages/ts-runtypes/src/runtypes/rtUtils.ts:252,288` | Correct detection of the **intentional** `new Function(...)` code-mode reconstruction (`buildPureFnFactoryFromCode`, `buildFactoryFromCode`). These are the only two runtime `new Function` call sites; the rest are comments. → justified inline `// oxlint-disable-next-line typescript/no-implied-eval` at both, which keeps the rule live as a tripwire for accidental `eval`. |
| `unbound-method` ×2 | `packages/ts-runtypes/src/runtypes/classSerializerRegistry.ts:225,226` | **Real fix.** The public `ClassSerializerHandler<T>` interface declares `serialize?(instance)` / `deserialize?(data)` as **method** signatures, but they are stored on the entry and later invoked as standalone functions (never as methods with `this`). Align them to function-property signatures (`serialize?: (instance: T) => unknown`), matching the sibling `ClassSerializerEntry` which already uses that form. Type-only change; validate the public-API variance shift against the existing typecheck + tests. |
| `no-base-to-string` ×1 | `packages/ts-runtypes/src/mocking/mockType.ts:573` | **Real fix.** `String(span.literal)` where `TemplateLiteralPlaceholder.literal` is `unknown`. A TS template-literal placeholder value is always a primitive literal — narrow the field to `string \| number \| bigint \| boolean`. Type-only change. |
| `restrict-template-expressions` ×1 | `packages/ts-runtypes-devtools/src/unplugin.ts:267` | **FALSE POSITIVE — pre-stable engine bug, not a code issue.** Isolated with throwaway probes: `0.22.0` tsgolint mis-resolves `ModuleMode` (the `typeof`-based union alias in `packages/ts-runtypes-devtools/src/go-generated/runtypes-constants.generated.ts`) as an `any`/`error` type. A reduced probe surfaced it explicitly as `no-redundant-type-constituents: 'ModuleMode' is an 'error' type that acts as 'any'`. The repo's own `tsc` typecheck resolves `ModuleMode` correctly (CI is green). Local string-literal interpolation and even importing the same const *values* both lint clean — only the `typeof`-union type alias trips it. |

The headline safety rules (`no-floating-promises`, `no-misused-promises`, `await-thenable`) fired
**zero** — the codebase's promise handling is already clean.

### Why this waits for stable

The confirmed false positive (and the `ModuleMode` type-resolution bug behind it) means adopting
on the pre-stable engine would require baking suppressions around **engine bugs**, not real
issues — a bad thing to commit. Type-aware linting went **stable on 2026-07-22** (oxlint 1.75.0
line, tsgolint `7.0.x`), which is expected to fix these resolution bugs. Chosen path: **wait for
stable to age past `minimumReleaseAge`, then adopt cleanly** — no supply-chain-policy relaxation,
no engine-bug workarounds.

## Plan (execute on/after 2026-08-21)

1. **Deps** — root [`package.json`](../../package.json) devDependencies (exact-pinned per
   policy): bump `oxlint` from `1.68.0` to the current stable (≥ 1.75.0, aged ≥ 30 days at the
   time of the run) and add matching `oxlint-tsgolint` (the `7.0.x` line paired with that
   oxlint; pnpm wires it as oxlint's optional peer, shown in the lockfile as
   `oxlint@<v>(oxlint-tsgolint@<v>)`). `pnpm add -Dw oxlint@<v> oxlint-tsgolint@<v>`.
   No `allowBuilds` entry needed — tsgolint ships prebuilt platform binaries
   (`@oxlint-tsgolint/<os>-<arch>`), no install script, so `ignoreScripts: true` is fine.
2. **Enable** — add `"options": { "typeAware": true }` to
   [`.oxlintrc.json`](../../.oxlintrc.json) (root-config only; **do not** enable `typeCheck` —
   the repo already runs `tsc` for compiler diagnostics). Everything that uses the
   `lint:runtypes` script inherits it automatically: `pnpm run lint`, `pnpm rtx verify`,
   `ci.yml` (job `js-lint`), and `release-gate.yml`. The RunTypes `jsPlugins` lint plugin is
   orthogonal and stays as-is.
3. **Re-run + re-triage** `oxlint --type-aware` on stable. Expected: the 5 legit findings below
   persist and the `restrict-template-expressions` false positive is gone. The multi-minor
   oxlint bump (1.68 → ≥ 1.75) may surface a few unrelated *syntax*-rule findings — fix or scope
   those too.
4. **Apply the 5 legit resolutions** from the table: 2 inline `no-implied-eval` suppressions
   (rtUtils.ts) + the `unbound-method` interface fix (classSerializerRegistry.ts) + the
   `no-base-to-string` narrowing (mockType.ts).
5. **CI** — confirm `oxlint-tsgolint` installs on the runner via `.github/actions/bootstrap`
   (`pnpm install` pulls the linux-x64 prebuilt binary; no Go toolchain needed for it) and that
   lint stays green in both `ci.yml` and `release-gate.yml`.
6. **Verify** — `pnpm run lint` clean, `pnpm test` green, `pnpm run format` /
   `pnpm run check-format` clean.
7. **Docs + close** — dev-tooling only, so **no website docs**. Add the new `oxlint-tsgolint` dev
   dep + the type-aware lint step to [`SETUP.md`](../../SETUP.md)'s lint section if it enumerates
   lint deps/commands. Then `git mv` this file into `docs/done/`.

## Done when

- `oxlint --type-aware` is on by default in `.oxlintrc.json` and green across `pnpm run lint`,
  `ci.yml`, and `release-gate.yml`.
- The 3 real code findings are fixed and the 2 `new Function` sites carry justified inline
  suppressions.
- `pnpm test` and `pnpm run check-format` stay green.

## Out of scope

- Enabling `typeCheck` (the repo's `tsc` typecheck already covers compiler diagnostics).
- Any change to the RunTypes lint plugin (`@ts-runtypes/devtools/eslint`).
- Relaxing `minimumReleaseAge` to install the engine sooner.

**Empirical notes for the future run:** oxlint auto-discovers each file's `tsconfig.json` (a
`--tsconfig=<path>` override exists but is **not** needed — the per-package `tsconfig.json`s
already `include` their `src`). Effective lint scope after the `.oxlintrc.json` `ignorePatterns`
is only `packages/ts-runtypes/src` (minus `caches/`) + `packages/ts-runtypes-devtools/src`;
tests, scripts, examples, and `ts-go-runtypes/` are all ignored.

## No test needed

This is a lint-config chore whose acceptance is the existing suite staying green with the rules
active; the three code fixes are type-only.
