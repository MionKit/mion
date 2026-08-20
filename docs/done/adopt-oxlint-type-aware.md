---
type: chore
spec: full-plan
status: done
created: 2026-07-04
updated: 2026-08-20
---

# Adopt `oxlint --type-aware` for this repo's own source

**Shipped 2026-08-20.** `oxlint --type-aware` is on by default via `options.typeAware` in
[`.oxlintrc.json`](../../.oxlintrc.json), powered by `oxlint@1.75.0` +
`oxlint-tsgolint@7.0.2001`, with all 14 findings resolved and the suite green. See
[What shipped](#what-shipped) for where the outcome differed from the plan.

**The wait was the whole blocker.** The adoption needed `oxlint@1.75.0` (the first stable
type-aware line) plus its paired `oxlint-tsgolint@7.0.2001`, and the repo's
`minimumReleaseAge: 43200` (30 days) in [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml)
blocked installing them until each turned 30 days old:

| Package | Published | Installable from |
|---------|-----------|------------------|
| `oxlint-tsgolint@7.0.2001` | 2026-07-21 14:33 UTC | 2026-08-20 14:33 UTC |
| `oxlint@1.75.0` | 2026-07-21 23:21 UTC | 2026-08-20 23:21 UTC |

Checked 2026-08-19, one day early, the install still failed with
`ERR_PNPM_NO_MATURE_MATCHING_VERSION — Version 7.0.2001 (released 29 days ago) of
oxlint-tsgolint does not meet the minimumReleaseAge constraint`. No newer oxlint would have
helped: 1.76.0 ages in 2026-08-26, and every oxlint ≥ 1.75.0 pins the same
`oxlint-tsgolint >= 7.0.2001`, so 1.75.0 + 7.0.2001 was the pair regardless. It installed
cleanly on 2026-08-20, resolving as `oxlint@1.75.0(oxlint-tsgolint@7.0.2001)` with no
collateral bumps in the lockfile.

The full scope was re-measured **on the stable engine** on 2026-08-19 (a throwaway install
outside the repo, no policy relaxation) and every resolution written out below before the
engine was installable — so the run itself was turnkey.

**History:** the last surviving item of the OXC toolchain migration follow-ups
(parent: [`docs/done/oxc-toolchain-migration.md`](../done/oxc-toolchain-migration.md); points 1
(rolldown) and 2b (esbuild) shipped in [PR #191](https://github.com/MionKit/ts-run-types/pull/191),
see [`docs/done/scope-rename-ts-runtypes-org.md`](../done/scope-rename-ts-runtypes-org.md); the
Next.js item moved to [`docs/maybe/next-js-support.md`](../maybe/next-js-support.md) on
2026-07-22). The old `oxc-migration-followups.md` was dropped on 2026-08-01 (commit `e0d36971`)
as "not adopting"; that call was reversed on 2026-08-03 — we are adopting, just not until the
stable engine ages in.

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

## Re-triage on the stable engine (2026-08-19) — authoritative

Installed `oxlint@1.75.0` + `oxlint-tsgolint@7.0.2001` on a throwaway basis **outside the repo**
(a scratch npm project, so no workspace dependency or config change and no policy relaxation) and
ran that binary against the repo's real [`.oxlintrc.json`](../../.oxlintrc.json). This supersedes
the 2026-07-24 pre-stable measurement below.

**The stable core is clean.** Bumping 1.68 → 1.75 without `--type-aware` reports 0 findings over
107 files, so the multi-minor bump adds no syntax-rule triage.

**Type-aware flags 14 findings across 8 files** (the pre-stable run predicted 6 across 4):

| Rule | Site(s) | Resolution |
|------|---------|------------|
| `unbound-method` ×2 | `packages/ts-runtypes/src/runtypes/classSerializerRegistry.ts:225,226` | **Real fix.** The public `ClassSerializerHandler<T>` interface (`:85`) declares `serialize?(instance)` / `deserialize?(data)` as **method** signatures, but they are stored on the entry and later invoked as standalone functions (never as methods with `this`). Align them to function-property signatures (`serialize?: (instance: T) => unknown`), matching the sibling `ClassSerializerEntry` (`:98`) which already uses that form; carry the same form into the overload at `:199`. Type-only; validate the public-API variance shift (method params are bivariant, property params contravariant) against typecheck + tests. |
| `no-implied-eval` ×2 | `packages/ts-runtypes/src/runtypes/rtUtils.ts:274,310` | Correct detection of the **intentional** `new Function(...)` code-mode reconstruction (`buildPureFnFactoryFromCode`, `buildFactoryFromCode`). These are the only two runtime `new Function` call sites; the rest are comments. → justified inline `// oxlint-disable-next-line typescript/no-implied-eval` at both, which keeps the rule live as a tripwire for accidental `eval`. |
| `no-base-to-string` ×1 | `packages/ts-runtypes/src/mocking/mockType.ts:871` | **Real fix.** `String(span.literal)` where `TemplateLiteralPlaceholder.literal` (`:860`) is `unknown`. A TS template-literal placeholder value is always a primitive literal — narrow the field to `string \| number \| bigint \| boolean`. Type-only change. |
| `no-base-to-string` ×1 | `packages/ts-runtypes/src/standard/jsonSchemaDoc.ts:75` | **Real fix, new.** `String(raw)` where `raw` comes from `libraryOptions?: Record<string, unknown>` ([`spec.ts:114`](../../packages/ts-runtypes/src/standard/spec.ts)), so it genuinely is `unknown` — a user passing an object gets `[object Object]` in the error. Quote the string case (the realistic one, a typo) and name the type otherwise. |
| `no-misused-spread` ×7 | `mocking/mockStringFormat.ts:263`, `formats/string/string-formats-pure-fns.ts:206,269,327,329`, `ts-runtypes-go-be-sidecar/src/jobs.ts:145,216` | **All intentional, new.** Every site is `[...str]` used deliberately for **code-point** iteration — the JSON Schema `minLength`/`maxLength` semantics the emitted validators check, plus punycode/IDNA processing. The rule's own warning (that spreading splits emoji into code points) is precisely the behaviour these sites want. → configure `"typescript/no-misused-spread": ["error", {"allow": ["string"]}]`, verified on a probe to clear all string spreads while still catching the dangerous half (spreading a `Map` into an object literal). Cheaper and more honest than 7 inline suppressions. |
| `restrict-template-expressions` ×1 | `packages/ts-runtypes-devtools/src/unplugin.ts:389` | **Real fix — this is NOT the false positive the 2026-07-24 run recorded.** The stable engine labels it `Type: never` on the interpolated `MODULE_MODE_ALL_MODULES`, and **`tsc` agrees**: after `moduleMode !== MODULE_MODE_DEFAULT && … !== MODULE_MODE_ALL_SINGLE` the checked value is already `never`, and the third comparison narrows the *constant itself* to `never`. Confirmed with a reduced probe — inside that branch `const probe: number = C` compiles clean (so `C` is `never`) while the same line against the first constant errors with `Type 'string' is not assignable to type 'number'`. → hoist the three modes into a module-level `as const` tuple, validate with `.includes(...)`, and build the "expected" list from that tuple; the narrowing and the triplicated literals both go away. |

The headline safety rules (`no-floating-promises`, `no-misused-promises`, `await-thenable`) fire
**zero** — the codebase's promise handling is already clean.

### What changed versus the pre-stable measurement

1. **The "false positive" is real.** The 2026-07-24 run blamed a pre-stable tsgolint bug that
   mis-resolved the `ModuleMode` `typeof`-union alias as an `any`/`error` type. On stable the
   diagnostic is different (`Type: never`) and independently confirmed against `tsc`. Nothing
   here needs a suppression baked around an engine bug — the original reason to wait held, and
   the answer it produced was "fix the code", not "suppress it".
2. **The lint scope grew.** The old note recorded it as `packages/ts-runtypes/src` +
   `packages/ts-runtypes-devtools/src`. `packages/ts-runtypes-go-be-sidecar/src` has since been
   added to the workspace and carries 2 of the findings.
3. **`no-misused-spread` is new to the finding set** (7 sites) — a rule the pre-stable engine
   either did not ship or did not run.

## Investigation (2026-07-24) — superseded, kept for history

Installed the pre-stable engine on a throwaway basis (`oxlint-tsgolint@0.22.0`, resolved as an
optional peer of the then-pinned `oxlint@1.68.0`) and ran `oxlint --type-aware` across the real
linted scope. It flagged 6 findings across 4 files: the two `no-implied-eval` sites, the two
`unbound-method` sites, the `mockType.ts` `no-base-to-string` site, and the
`restrict-template-expressions` site — the last of which was diagnosed as a **false positive**
(`no-redundant-type-constituents: 'ModuleMode' is an 'error' type that acts as 'any'` on a
reduced probe). That diagnosis was engine-specific and does not survive on stable; see above.

That run is why the adoption waited: baking suppressions around **engine bugs** rather than real
issues is a bad thing to commit, so the chosen path was to wait for the stable engine to age past
`minimumReleaseAge` and adopt cleanly — no supply-chain-policy relaxation, no workarounds.

## What shipped

Executed 2026-08-20, in one pass, on branch `chore/adopt-oxlint-type-aware`. The plan below
held; four things came out differently and are worth knowing:

1. **`no-misused-spread` needed the config option AND one inline suppression.** The
   `{"allow": ["string"]}` option clears 6 of the 7 code-point spreads, but not
   `jobs.ts:145` — `PROPERTY_ALPHABET` is a `const x = '…'`, so its type is a string
   *literal*, and the option's type specifier cannot name one. Verified against the engine
   with three specifier shapes (`"string"`, `"String"`, `{from: 'lib', name: 'String'}`);
   all leave a literal-typed spread flagged. The site therefore carries a justified inline
   suppression explaining why it is the exception, rather than widening the constant's type
   to satisfy a linter. Final tally: **3 suppressions** (2 × `no-implied-eval`,
   1 × `no-misused-spread`) and 4 code fixes.
2. **The `mockType.ts` narrowing is `string | number | boolean`**, not the
   `string | number | bigint | boolean` the plan guessed. `templateSpanWireShape` in
   [`cachegen/runtype/serialize.go`](../../ts-go-runtypes/internal/cachegen/runtype/serialize.go)
   emits a `literal` field for string, number and boolean literal spans only; a bigint span
   gets `KindBigInt` with no value, and a bigint *literal* falls through to the string-shaped
   fallback. The field is typed to exactly what the emitter can write.
3. **The moduleMode guard moved into its own module** rather than being restructured in
   place. It ran inside `ensureResolver`, a closure that needs a real resolver child, so it
   was extracted to `packages/ts-runtypes-devtools/src/module-mode.ts` (exporting
   `MODULE_MODES` and `assertValidModuleMode`) and unit-tested directly — the same pattern
   `buildResolverArgs` uses for `resolver-args.test.ts`. Keeping it out of `unplugin.ts` also
   keeps the published `./unplugin` entry's surface unchanged.
4. **The test is `module-mode-guard.test.ts`**, because `module-mode.test.ts` already exists
   and covers what each mode emits. The new file covers only the option guard.

Verified: `pnpm run lint` clean (108 files, 115 rules — up from 100 without type-aware),
`pnpm test` 277 files / 9332 tests passing, `pnpm run check-format` clean, and
`pnpm install --frozen-lockfile` clean. No Go source changed.

## Plan as written (executed 2026-08-20)

1. **Deps** — root [`package.json`](../../package.json) devDependencies (exact-pinned per
   policy): bump `oxlint` `1.68.0` → `1.75.0` and add `oxlint-tsgolint@7.0.2001`, via
   `pnpm add -Dw oxlint@1.75.0 oxlint-tsgolint@7.0.2001`. pnpm wires tsgolint as oxlint's
   optional peer, shown in the lockfile as `oxlint@1.75.0(oxlint-tsgolint@7.0.2001)`.
   No `allowBuilds` entry needed — tsgolint ships prebuilt platform binaries
   (`@oxlint-tsgolint/<os>-<arch>`), no install script, so `ignoreScripts: true` is fine.

   **`oxlint-tsgolint` moving is the only thing worth re-checking before the run**; if a newer
   one has itself aged past 30 days, take it (and the matching oxlint).
2. **Enable** — in [`.oxlintrc.json`](../../.oxlintrc.json) add `"options": {"typeAware": true}`
   (confirmed as the correct key against oxlint 1.75.0's `configuration_schema.json`;
   **do not** enable `typeCheck` — the repo already runs `tsc` for compiler diagnostics) plus
   the `no-misused-spread` rule option from the table. Everything that uses the `lint:runtypes`
   script inherits it automatically: `pnpm run lint`, `pnpm rtx verify`, `ci.yml` (job
   `js-lint`), and `release-gate.yml`. The RunTypes `jsPlugins` lint plugin is orthogonal and
   stays as-is.
3. **Apply the six resolutions** from the table (2 suppressions + 4 code fixes). Rebuild
   `ts-runtypes-devtools` after its src edit — consumers read its dist.
4. **Re-run + re-triage.** Expect a clean run; anything new is a same-day-of-run delta from a
   newer engine and gets triaged the same way.
5. **CI** — nothing to add: `.github/actions/bootstrap` already runs
   `pnpm install --frozen-lockfile`, which pulls the linux-x64 prebuilt binary (no Go toolchain
   needed for it). Confirm lint stays green in both `ci.yml` and `release-gate.yml`.
6. **Verify** — `pnpm run lint` clean, `pnpm test` green, `pnpm run format` /
   `pnpm run check-format` clean, `pnpm install --frozen-lockfile` clean.
7. **Docs + close** — dev-tooling only, so **no website docs**. Add the new `oxlint-tsgolint` dev
   dep + the type-aware step to [`SETUP.md`](../../SETUP.md)'s lint section (the paragraph at
   ~line 192 that enumerates what the oxlint pass covers). Then reconcile this spec with what
   actually shipped and `git mv` it into `docs/done/`.

## Done when — all met

- ✅ `oxlint --type-aware` is on by default in `.oxlintrc.json` and green under
  `pnpm run lint`. `ci.yml` and `release-gate.yml` both call that same script and need no
  change of their own — the runner picks the engine up through the existing
  `pnpm install --frozen-lockfile`.
- ✅ All 14 findings resolved: 4 code fixes, 2 justified suppressions at the `new Function`
  sites, the `no-misused-spread` string allowance covering 6 of the 7 code-point spreads, and
  1 suppression for the seventh (see [What shipped](#what-shipped)).
- ✅ `pnpm test` and `pnpm run check-format` green.

## Out of scope

- Enabling `typeCheck` (the repo's `tsc` typecheck already covers compiler diagnostics).
- Any change to the RunTypes lint plugin (`@ts-runtypes/devtools/eslint`).
- Relaxing `minimumReleaseAge` to install the engine sooner.

**Empirical notes for the run:** oxlint auto-discovers each file's `tsconfig.json` (a
`--tsconfig=<path>` override exists but is **not** needed — the per-package `tsconfig.json`s
already `include` their `src`). Effective lint scope after the `.oxlintrc.json` `ignorePatterns`
is `packages/ts-runtypes/src` (minus `caches/`) + `packages/ts-runtypes-devtools/src` +
`packages/ts-runtypes-go-be-sidecar/src`; tests, scripts, examples, and `ts-go-runtypes/` are all
ignored. Type-aware costs little: a full pass is ~1.2s against ~0.7s for the core-only pass, and
the single-file shape `lint-staged` runs at pre-commit is ~436ms against ~255ms — no need to
scope the hook away from it.

## Tests

Mostly a lint-config chore whose acceptance is the existing suite staying green with the rules
active, and four of the six resolutions are type-only. One exception: the `moduleMode` validation
in `unplugin.ts` had **no test at all** and this change rewrote it, so
[`module-mode-guard.test.ts`](../../packages/ts-runtypes-devtools/test/module-mode-guard.test.ts)
was added — 4 cases: every declared mode accepted, `undefined` accepted, an unknown mode rejected
with a message naming all three valid modes, and a `satisfies` guard so the `MODULE_MODES` tuple
cannot silently stop covering the `ModuleMode` union.
